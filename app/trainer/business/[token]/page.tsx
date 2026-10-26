import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { RULE_MESSAGES } from '@/lib/trainer/rpc'
import BillingButton from '../../(shell)/settings/BillingButton'

// 管理者用の登録ページ（2026-10-26 オーナー決定: ビジネスプランはお問い合わせ制）。
// 運営がお問い合わせの相手のメールアドレス宛てに発行して送る（lib/sql/business_invite_2026-10-26.sql）。
// 順番（2026-10-26 オーナー指摘）: ログイン → プランを申し込む → チームを作る（名前・自分もクライアントを担当するかを選ぶ）。
// 申し込みにはトレーナーの登録が要るので、未登録なら仮の名前（メールアドレスの@の前）で登録しておき、
// 名前はチームを作る時に決めてもらう。
export default async function BusinessInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const path = `/trainer/business/${encodeURIComponent(token)}`
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`)

  let profile = await getTrainerProfile(supabase, user.id)
  if (!profile) {
    const tentative = (user.email ?? '').split('@')[0].slice(0, 40) || '管理者'
    const { error: registerError } = await supabase.rpc('register_as_trainer', { p_display_name: tentative })
    // ログイン直後は同じページが2回続けて開かれる（ログイン画面の router.replace と router.refresh）ため、
    // もう片方が先に登録を済ませていることがある。読み直して、それでも無い時だけ失敗にする（2026-10-26）。
    profile = await getTrainerProfile(supabase, user.id)
    if (!profile) {
      console.error('[business-invite] register_as_trainer failed', { userId: user.id, error: registerError })
      return (
        <Frame title="ビジネスプランのご案内">
          <p className="text-sm text-red-600 leading-relaxed">登録に失敗しました。もう一度お試しください。続く場合はお手数ですが運営までお問い合わせください。</p>
          <a href={path} className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">もう一度試す</a>
        </Frame>
      )
    }
  }

  const { error } = await supabase.rpc('redeem_business_invite', { p_token: token })
  if (error) {
    const message = (error.hint && RULE_MESSAGES[error.hint]) || 'このページを開けませんでした。お手数ですが運営までお問い合わせください'
    return (
      <Frame title="ビジネスプランのご案内">
        <p className="text-sm text-red-600 leading-relaxed">{message}</p>
        <p className="text-xs text-zinc-500">ログイン中: {user.email}</p>
        <Link href="/trainer/dashboard" className="block text-center text-sm text-zinc-500 underline">トレーナー画面へ</Link>
      </Frame>
    )
  }

  if (profile.plan === 'business') {
    return (
      <Frame title="ビジネスプランをご利用中です">
        <p className="text-sm text-zinc-500 leading-relaxed">「チーム」からチームを作り、トレーナーを招待できます。</p>
        <Link href="/trainer/team?welcome=1" className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">チームへ</Link>
      </Frame>
    )
  }

  return (
    <Frame title="ビジネスプランのお申し込み">
      <div className="px-4 py-3 rounded-xl border border-line space-y-1">
        <p className="text-sm font-semibold text-black">ビジネスプラン ¥19,800〜 / 月（税込）</p>
        <p className="text-sm text-zinc-500 leading-relaxed">クライアント無制限。トレーナー3名までのチームで、クライアントの閲覧・担当替え・プログラムの共有ができます。4名以上は1名につき ¥5,000 / 月（税込）で追加できます（ご相談のうえ）。</p>
      </div>
      <p className="text-sm text-zinc-500 leading-relaxed">お申し込みの後に、チームの名前と、あなたもクライアントを担当するかを選んでいただきます。</p>
      {profile.plan === 'pro' ? (
        <p className="text-sm text-zinc-500 leading-relaxed">プロプランをご利用中です。設定の「プラン」から、日割りでビジネスプランに切り替えられます。</p>
      ) : (
        <BillingButton kind="checkout" plan="business" label="お支払いへ進む" primary />
      )}
      <Link href={profile.plan === 'pro' ? '/trainer/settings' : '/trainer/dashboard'} className="block text-center text-sm text-zinc-500 underline">
        {profile.plan === 'pro' ? '設定を開く' : 'あとで申し込む（設定の「プラン」からも申し込めます）'}
      </Link>
    </Frame>
  )
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="light-only min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-zinc-500">Auxlog for トレーナー</p>
          <h1 className="text-2xl font-semibold tracking-tight text-black">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
