import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Stripe from 'stripe'
import { ChevronLeft, CreditCard } from 'lucide-react'
import CancelButton from '../CancelButton'
import ResumeButton from './ResumeButton'
import ChangeCardButton from './ChangeCardButton'

function getStatusLabel(status: string | null): string {
  const labels: Record<string, string> = {
    trialing: 'トライアル中',
    active: '有効',
    canceling: '解約予定',
    canceled: 'キャンセル済み',
    past_due: '支払い遅延',
  }
  return status ? (labels[status] ?? status) : '未開始'
}

function getStatusColor(status: string | null): string {
  if (status === 'active') return 'text-emerald-500'
  if (status === 'trialing') return 'text-accent'
  if (status === 'canceling') return 'text-accent'
  if (status === null) return 'text-zinc-400'
  return 'text-red-500'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

export default async function SubscriptionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, is_admin, is_free, free_until')
    .eq('id', user.id)
    .single()

  const isAdmin = userData?.is_admin ?? false
  const isFree = userData?.is_free ?? false
  const freeUntil = userData?.free_until ?? null
  const freeActive = isFree && (!freeUntil || new Date(freeUntil) > new Date())
  const status = isAdmin ? 'active' : (userData?.subscription_status ?? null)
  const trialEndsAt = userData?.trial_ends_at ?? null

  // Stripeからカード情報・サブスク情報を取得
  type CardInfo = { brand: string; last4: string; expMonth: number; expYear: number } | null
  let cardInfo: CardInfo = null
  let nextBillingDate: string | null = null

  if (process.env.STRIPE_SECRET_KEY && userData?.stripe_customer_id) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const [customer, subscription] = await Promise.all([
        stripe.customers.retrieve(userData.stripe_customer_id, {
          expand: ['invoice_settings.default_payment_method'],
        }) as Promise<Stripe.Customer>,
        userData?.stripe_subscription_id
          ? stripe.subscriptions.retrieve(userData.stripe_subscription_id)
          : Promise.resolve(null),
      ])
      const pm = customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null
      if (pm?.card) {
        cardInfo = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        }
      }
      const sub = subscription as unknown as { current_period_end?: number } | null
      if (status === 'active' && sub?.current_period_end) {
        nextBillingDate = new Date(sub.current_period_end * 1000).toISOString()
      }
    } catch { /* 取得失敗は無視 */ }
  }

  const brandLabel: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express',
    jcb: 'JCB', discover: 'Discover', unionpay: 'UnionPay',
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 py-5 z-10 flex items-center gap-2">
        <Link href="/settings" className="p-1.5 -ml-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-base font-semibold text-black dark:text-white">サブスクリプション</h1>
      </div>

      <div className="px-6 py-6 space-y-4">
        {/* ステータス */}
        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">プラン</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-black dark:text-white">Auxlog Premium</span>
            {status !== 'trialing' && !freeActive && (
              <span className="text-sm font-black text-black dark:text-white">¥480<span className="text-xs font-normal text-zinc-400">/月</span></span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">ステータス</span>
            <span className={`text-sm font-medium ${isAdmin || freeActive ? 'text-emerald-500' : getStatusColor(status)}`}>
              {isAdmin ? '有効（管理者）' : freeActive ? `無料${freeUntil ? '（期限付き）' : ''}` : getStatusLabel(status)}
            </span>
          </div>
          {freeActive && freeUntil && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">無料期限</span>
              <span className="text-sm text-black dark:text-white">{formatDate(freeUntil)}</span>
            </div>
          )}
          {trialEndsAt && (status === 'trialing' || status === 'canceling') && !freeActive && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {status === 'canceling' ? 'サービス終了日' : 'トライアル終了日'}
              </span>
              <span className="text-sm text-black dark:text-white">{formatDate(trialEndsAt)}</span>
            </div>
          )}
          {nextBillingDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">次回更新日</span>
              <span className="text-sm text-black dark:text-white">{formatDate(nextBillingDate)}</span>
            </div>
          )}
        </div>

        {/* クレジットカード情報（管理者・無料ユーザーには表示しない） */}
        {!isAdmin && !freeActive && <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">お支払い方法</h2>
          {cardInfo ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  {brandLabel[cardInfo.brand] ?? cardInfo.brand} **** {cardInfo.last4}
                </p>
                <p className="text-xs text-zinc-400">
                  有効期限 {String(cardInfo.expMonth).padStart(2, '0')}/{cardInfo.expYear}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">カード未登録</p>
          )}
          {status !== 'canceled' && (
            <ChangeCardButton />
          )}
        </div>}

        {/* アクション（管理者・無料ユーザーには表示しない） */}
        {!isAdmin && !freeActive && (status === 'active' || status === 'trialing') && <CancelButton />}
        {!isAdmin && !freeActive && status === 'canceling' && <ResumeButton />}
        {!isAdmin && !freeActive && status === 'canceled' && (
          <Link
            href="/subscribe?reason=canceled"
            className="w-full block text-center py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
          >
            サブスクリプションを更新する
          </Link>
        )}
      </div>
    </div>
  )
}
