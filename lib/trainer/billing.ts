import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

// トレーナーの課金（2026-10-26）。プロ ¥9,800/月（税込）を Stripe Checkout で申し込み、プランの変更・解約・領収書は
// Stripe のお客様ポータルで行う。プランの反映は Webhook（app/api/webhooks/stripe）だけが行う。
// サブスクの metadata.kind で、以前のセルフモードのサブスク（users テーブル）と区別する。

export const TRAINER_SUBSCRIPTION_KIND = 'trainer_plan'

export function getStripe(): Stripe | null {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
}

/** この状態の間はプロプランとして使える（支払いの再試行中 past_due も、Stripe が諦めるまでは止めない） */
export function isPaidStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export type TrainerSubscriptionUpdate = {
  plan: 'starter' | 'pro'
  stripe_subscription_id: string
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

/** Stripe のサブスクから trainer_profiles に書く値を作る（終了したサブスクはスターターに戻す） */
export function trainerSubscriptionUpdate(sub: Stripe.Subscription): TrainerSubscriptionUpdate {
  // API 2025-03 以降、更新日はサブスクではなく品目（items）に付く
  const periodEnd = sub.items.data[0]?.current_period_end
  return {
    plan: isPaidStatus(sub.status) ? 'pro' : 'starter',
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
  // 手動で設定したビジネスプラン（お問い合わせ経由）は Webhook で上書きしない。
  // 別のサブスク（解約後に申し込み直した等）の古いイベントで、今のサブスクの状態を消さない
  if (profile.plan === 'business') return
  if (profile.stripe_subscription_id && profile.stripe_subscription_id !== sub.id && update.plan === 'starter') return
  const { error } = await service.from('trainer_profiles').update(update).eq('user_id', userId)
  if (error) throw error
}
