import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

// トレーナーの課金（2026-10-26）。プロ ¥9,800/月・ビジネス ¥19,800/月（税込）を Stripe Checkout で申し込み、
// プロ⇔ビジネスの切り替えは日割りで差額を次の請求で精算（/api/trainer/billing/change）。カードの変更・解約・領収書は
// Stripe のお客様ポータルで行う。プランの反映は Webhook（app/api/webhooks/stripe）だけが行う。
// サブスクの metadata.kind で、以前のセルフモードのサブスク（users テーブル）と区別する。

export const TRAINER_SUBSCRIPTION_KIND = 'trainer_plan'

export type PaidPlan = 'pro' | 'business'

/** 申し込むプランの Stripe の価格（本番とテストで ID が違うので環境変数で持つ） */
export function priceIdOf(plan: PaidPlan): string | undefined {
  return plan === 'business' ? process.env.STRIPE_TRAINER_BUSINESS_PRICE_ID : process.env.STRIPE_TRAINER_PRO_PRICE_ID
}

export function getStripe(): Stripe | null {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
}

/** この状態の間はプロプランとして使える（支払いの再試行中 past_due も、Stripe が諦めるまでは止めない） */
export function isPaidStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export type TrainerSubscriptionUpdate = {
  plan: 'starter' | PaidPlan
  stripe_subscription_id: string
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

/** Stripe のサブスクから trainer_profiles に書く値を作る（終了したサブスクはスターターに戻す） */
export function trainerSubscriptionUpdate(sub: Stripe.Subscription): TrainerSubscriptionUpdate {
  // API 2025-03 以降、更新日はサブスクではなく品目（items）に付く
  const item = sub.items.data[0]
  const periodEnd = item?.current_period_end
  // どのプランかは価格の metadata.auxlog_plan（trainer_pro / trainer_business）で見分ける
  const paidPlan: PaidPlan = item?.price?.metadata?.auxlog_plan === 'trainer_business' ? 'business' : 'pro'
  return {
    plan: isPaidStatus(sub.status) ? paidPlan : 'starter',
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at != null,
  }
}

/** Webhook から: サブスクの最新の状態を Stripe から読み直して反映する（イベントの届く順番が前後しても最新になる） */
export async function syncTrainerSubscription(stripe: Stripe, service: SupabaseClient, subscriptionId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const userId = sub.metadata.user_id
  if (!userId) return
  const update = trainerSubscriptionUpdate(sub)
  const { data: profile } = await service.from('trainer_profiles').select('plan, stripe_subscription_id').eq('user_id', userId).maybeSingle()
  if (!profile) return
  // 手動で設定したビジネスプラン（Stripe のサブスクが無い）は Webhook で上書きしない。
  // 別のサブスク（解約後に申し込み直した等）の古いイベントで、今のサブスクの状態を消さない
  if (profile.plan === 'business' && !profile.stripe_subscription_id) return
  if (profile.stripe_subscription_id && profile.stripe_subscription_id !== sub.id && update.plan === 'starter') return
  const { error } = await service.from('trainer_profiles').update(update).eq('user_id', userId)
  if (error) throw error
}

/**
 * チームに参加を承認された時に、メンバー自身のプロプランを今の期間の終わりで解約する（2026-10-26 オーナー決定:
 * 返金なし。承認された時からチームのビジネスプランで使える）。反映は Webhook と同じく Stripe から読み直して行う。
 */
export async function cancelOwnPlanForTeam(service: SupabaseClient, trainerId: string): Promise<void> {
  const { data: profile } = await service
    .from('trainer_profiles')
    .select('stripe_subscription_id, subscription_status, cancel_at_period_end')
    .eq('user_id', trainerId)
    .maybeSingle()
  const subId = profile?.stripe_subscription_id
  if (!subId || profile.cancel_at_period_end || !isPaidStatus(profile.subscription_status as Stripe.Subscription.Status)) return
  const stripe = getStripe()
  if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set')
  await stripe.subscriptions.update(subId, { cancel_at_period_end: true })
  await syncTrainerSubscription(stripe, service, subId)
}
