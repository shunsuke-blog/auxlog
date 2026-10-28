import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import LogoutButton from '@/app/(app)/settings/LogoutButton'
import BillingButton, { ChangePlanButton } from './BillingButton'
import { PAID_PLANS, PAID_PLAN_INFO, type PaidPlan } from '@/lib/trainer/billing'
import { TRAINER_PLANS } from '@/lib/trainer/dashboard'
import InquiryForm from '@/components/trainer/InquiryForm'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })

// トレーナーの設定: プラン（課金、2026-10-26）・アカウント・ログアウト。
// ベーシック ¥2,980/月・プロ ¥6,800/月・ビジネス ¥19,800/月（税込、2026-10-27 改定）は Stripe で申し込み、有料プラン同士は日割りで切り替え、
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
  const paid = plan !== 'starter'
  // ビジネスはお問い合わせ制（2026-10-26）: 運営が許可したトレーナー（管理者用の登録ページを開いた人）だけ申し込める
  const businessAllowed = sub?.business_allowed === true

  return (
    <div>
      <div className="sticky top-0 z-10 trainer-header h-14 md:h-[72px] px-4 md:px-6 flex items-center">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>
      {/* PC ではビジネスのお問い合わせを右側（settings-side）に開く */}
      <div className="px-4 md:px-6 py-4 md:py-6 xl:flex xl:items-start xl:gap-6">
        <div className="space-y-4 max-w-xl xl:w-xl xl:shrink-0">
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
                {PAID_PLANS.map(p => (
                  <PlanOption key={p} name={PAID_PLAN_INFO[p].name} price={PAID_PLAN_INFO[p].price} note={PAID_PLAN_INFO[p].note}>
                    {p === 'business' && !businessAllowed
                      ? <BusinessInquiry />
                      : <BillingButton kind="checkout" plan={p} label={`${PAID_PLAN_INFO[p].name}にする`} primary />}
                  </PlanOption>
                ))}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">表示価格は税込です。いつでも解約でき、解約しても期間の終わりまで使えます。</p>
              </div>
            )}
            {/* 切り替えは Stripe の契約がある時だけ（手動で有料プランにしたデモのアカウント等には出さない） */}
            {plan !== 'starter' && sub?.stripe_customer_id && (
              <div className="space-y-3 pt-1">
                {PAID_PLANS.filter(p => p !== plan).map(p => (
                  <PlanOption key={p} name={PAID_PLAN_INFO[p].name} price={PAID_PLAN_INFO[p].price} note={PAID_PLAN_INFO[p].note}>
                    {p === 'business' && !businessAllowed
                      ? <BusinessInquiry />
                      : <ChangePlanButton plan={p} label={`${PAID_PLAN_INFO[p].name}に切り替える`} confirmMessage={changeMessage(plan, p, usage.used)} />}
                  </PlanOption>
                ))}
              </div>
            )}
            {sub?.stripe_customer_id && <BillingButton kind="portal" label="お支払いの管理（カードの変更・解約・領収書）" />}
          </div>

          <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400">アカウント</h2>
            <p className="text-sm text-black dark:text-white">{profile?.display_name}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
          </div>
          <LogoutButton redirectTo="/trainer/login" />
        </div>
        <div id="settings-side" className="hidden xl:block flex-1 min-w-0 max-w-md sticky top-[96px]" />
      </div>
    </div>
  )
}

// 切り替えの確認の文。上げる時は今日から使えること、下げる時はチームが止まること・上限を超えることを伝える
function changeMessage(from: PaidPlan, to: PaidPlan, used: number): string {
  const up = PAID_PLANS.indexOf(to) > PAID_PLANS.indexOf(from)
  const lines = [`${PAID_PLAN_INFO[to].name}に切り替えますか？`]
  if (up) lines.push('今日から使えます。今月の残りの日数分の差額は、次回の請求で精算されます。')
  else {
    if (from === 'business') lines.push('チームは止まり、メンバーのトレーナーはそれぞれのプランに戻ります。')
    const limit = TRAINER_PLANS[to].limit
    if (limit != null && used > limit) lines.push(`今のクライアント（${used}名）が上限（${limit}名）を超えるため、${used - limit}名の契約を終了するまで、プログラムの作成・編集と招待はできなくなります。`)
    lines.push('差額は次回の請求で精算されます。')
  }
  return lines.join('\n')
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
      <InquiryForm kind="business" sidePanelId="settings-side" />
    </div>
  )
}
