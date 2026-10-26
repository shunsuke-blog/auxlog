import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import LogoutButton from '@/app/(app)/settings/LogoutButton'
import BillingButton, { ChangePlanButton } from './BillingButton'
import InquiryForm from '@/components/trainer/InquiryForm'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })

// トレーナーの設定: プラン（課金、2026-10-26）・アカウント・ログアウト。
// プロ ¥9,800/月・ビジネス ¥19,800/月（税込）は Stripe で申し込み、プロ⇔ビジネスは日割りで切り替え、
// カードの変更・解約・領収書は Stripe のお客様ポータル。チームのメンバーはチームのビジネスプランで使う。
export default async function TrainerSettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const { billing } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [profile, { data: sub }] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    supabase.from('trainer_profiles').select('stripe_customer_id, subscription_status, current_period_end, cancel_at_period_end, business_allowed').eq('user_id', user.id).maybeSingle(),
  ])
  const plan = profile?.plan ?? 'starter'
  const usage = await loadPlanUsage(supabase, user.id, plan)
  const inTeam = usage.team.role === 'member' && usage.team.active
  const paid = plan === 'pro' || plan === 'business'
  // ビジネスはお問い合わせ制（2026-10-26）: 運営が許可したトレーナー（管理者用の登録ページを開いた人）だけ申し込める
  const businessAllowed = sub?.business_allowed === true

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
            {inTeam && usage.team.role === 'member' && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">チーム「{usage.team.orgName}」のビジネスプランで利用中です（お支払いは管理者）。</p>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
              クライアント {usage.used}{usage.limit == null ? '名（無制限）' : ` / ${usage.limit}名`}
            </p>
            {paid && sub?.current_period_end && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {sub.cancel_at_period_end ? `${fmtDate(sub.current_period_end)} で終了します（スタータープランに戻ります）` : `次回の更新日 ${fmtDate(sub.current_period_end)}`}
              </p>
            )}
            {paid && sub?.subscription_status === 'past_due' && (
              <p className="text-sm text-red-500">お支払いが確認できていません。お支払いの管理からカードを確認してください。</p>
            )}
          </div>

          {plan === 'starter' && !inTeam && usage.team.role !== 'pending' && (
            <div className="space-y-3 pt-1">
              <PlanOption name="プロプラン" price="¥9,800" note="クライアント30名まで。">
                <BillingButton kind="checkout" plan="pro" label="プロプランにする" primary />
              </PlanOption>
              <PlanOption name="ビジネスプラン" price="¥19,800" note="トレーナー3名までのチームで、クライアント無制限。クライアントの閲覧・担当替え・プログラムの共有ができます。4名以上はご相談ください。">
                {businessAllowed ? <BillingButton kind="checkout" plan="business" label="ビジネスプランにする" primary /> : <BusinessInquiry />}
              </PlanOption>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">表示価格は税込です。いつでも解約でき、解約しても期間の終わりまで使えます。</p>
            </div>
          )}
          {/* 切り替えは Stripe の契約がある時だけ（手動でプロにしたデモのアカウント等には出さない） */}
          {plan === 'pro' && sub?.stripe_customer_id && (
            <PlanOption name="ビジネスプラン" price="¥19,800" note="トレーナー3名までのチームで、クライアント無制限。4名以上はご相談ください。">
              {businessAllowed ? <ChangePlanButton plan="business" label="ビジネスプランに切り替える" confirmMessage={'ビジネスプランに切り替えますか？\n今日から使えます。今月の残りの日数分の差額は、次回の請求で精算されます。'} /> : <BusinessInquiry />}
            </PlanOption>
          )}
          {plan === 'business' && sub?.stripe_customer_id && (
            <PlanOption name="プロプラン" price="¥9,800" note="クライアント30名まで（チームは使えなくなります）。">
              <ChangePlanButton plan="pro" label="プロプランに切り替える" confirmMessage={'プロプランに切り替えますか？\nチームは止まり、メンバーのトレーナーはそれぞれのプランに戻ります。差額は次回の請求で精算されます。'} />
            </PlanOption>
          )}
          {sub?.stripe_customer_id && <BillingButton kind="portal" label="お支払いの管理（カードの変更・解約・領収書）" />}
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

function PlanOption({ name, price, note, children }: { name: string; price: string; note: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-xl border border-line space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-black dark:text-white">{name} {price} / 月（税込）</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{note}</p>
      </div>
      {children}
    </div>
  )
}

// ビジネスはお問い合わせのうえで、運営から管理者用の登録ページを送る（2026-10-26 オーナー決定）
function BusinessInquiry() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-black dark:text-white">チームでのご利用はお問い合わせください。ご案内のうえ、お申し込みいただけるようにします。</p>
      <InquiryForm kind="business" />
    </div>
  )
}
