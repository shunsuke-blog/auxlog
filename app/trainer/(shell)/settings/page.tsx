import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import LogoutButton from '@/app/(app)/settings/LogoutButton'
import BillingButton from './BillingButton'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })

// トレーナーの設定: プラン（課金、2026-10-26）・アカウント・ログアウト。
// プロ ¥9,800/月（税込）は Stripe で申し込み、変更・解約・領収書は Stripe のお客様ポータル。ビジネスは当面お問い合わせ。
export default async function TrainerSettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const { billing } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [profile, { data: sub }] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    supabase.from('trainer_profiles').select('stripe_customer_id, subscription_status, current_period_end, cancel_at_period_end').eq('user_id', user.id).maybeSingle(),
  ])
  const plan = profile?.plan ?? 'starter'
  const usage = await loadPlanUsage(supabase, user.id, plan)

  return (
    <div>
      <div className="sticky top-0 z-10 trainer-header h-14 md:h-[72px] px-4 md:px-6 flex items-center">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>
      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 max-w-xl">
        {/* 支払いの直後は Webhook の反映が数秒遅れることがある */}
        {billing === 'success' && plan === 'starter' && (
          <p className="px-4 py-3 rounded-2xl bg-brand-soft text-sm text-black">お申し込みありがとうございます。プランの反映まで数秒かかることがあります。表示が変わらない時は、ページを読み込み直してください。</p>
        )}

        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400">プラン</h2>
          <div>
            <p className="text-base font-semibold text-black dark:text-white">{usage.label}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
              クライアント {usage.used}{usage.limit == null ? '名（無制限）' : ` / ${usage.limit}名`}
            </p>
            {plan === 'pro' && sub?.current_period_end && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {sub.cancel_at_period_end ? `${fmtDate(sub.current_period_end)} で終了します（スタータープランに戻ります）` : `次回の更新日 ${fmtDate(sub.current_period_end)}`}
              </p>
            )}
            {plan === 'pro' && sub?.subscription_status === 'past_due' && (
              <p className="text-sm text-red-500">お支払いが確認できていません。お支払いの管理からカードを確認してください。</p>
            )}
          </div>

          {plan === 'starter' && (
            <div className="space-y-3 pt-1">
              <div className="px-4 py-3 rounded-xl border border-line space-y-1">
                <p className="text-sm font-semibold text-black dark:text-white">プロプラン ¥9,800 / 月（税込）</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">クライアント30名まで。いつでも解約でき、解約しても期間の終わりまで使えます。</p>
              </div>
              <BillingButton kind="checkout" label="プロプランにする" primary />
            </div>
          )}
          {sub?.stripe_customer_id && <BillingButton kind="portal" label="お支払いの管理（カードの変更・解約・領収書）" />}
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            クライアント31名以上・複数のトレーナーでのご利用（ビジネスプラン ¥19,800 / 月）は
            <a href="mailto:auxlog.support@gmail.com?subject=ビジネスプランのお問い合わせ" className="underline hover:text-black">お問い合わせ</a>
            ください。
          </p>
        </div>

        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400">アカウント</h2>
          <p className="text-sm text-black dark:text-white">{profile?.display_name}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  )
}
