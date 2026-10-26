import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { CreateTeamForm } from '../(shell)/team/TeamActions'

// ビジネスプランの最初の画面（2026-10-26 オーナー指摘: 迷わせないよう、チームを作るまではタブを出さずこれだけにする）。
// ビジネスでチームが無い間は、トレーナー画面のどこを開いてもここに来る（(shell)/layout.tsx）。作り終えたらチームの画面へ。
export default async function TeamSetupPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trainer/team-setup')
  const profile = await getTrainerProfile(supabase, user.id)
  if (!profile) redirect('/trainer/start')

  const { data: owned } = await supabase.from('organizations').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (owned) redirect('/trainer/team')

  if (profile.plan !== 'business') {
    // 支払いの直後は Webhook の反映が数秒遅れることがある
    if (welcome !== '1') redirect('/trainer/dashboard')
    return (
      <Frame title="お申し込みありがとうございます">
        <p className="text-sm text-zinc-500 leading-relaxed">プランの反映まで数秒かかることがあります。少し待ってから、もう一度開いてください。</p>
        <a href="/trainer/team-setup?welcome=1" className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">もう一度開く</a>
        <Link href="/trainer/settings" className="block text-center text-sm text-zinc-500 underline">設定の「プラン」を見る</Link>
      </Frame>
    )
  }

  return (
    <Frame title="チームを作りましょう">
      <p className="text-sm text-zinc-500 leading-relaxed">
        ビジネスプランのお申し込みありがとうございます。チームを作ると招待コードが発行され、ほかのトレーナーを招待できます。
      </p>
      <CreateTeamForm displayName={profile.display_name} />
    </Frame>
  )
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // スマホは上から並べる（中身が画面より長く、中央寄せだと見出しが切れて開くことがある。2026-10-26 オーナー指摘）。
    // 高さは dvh: iPhone の Safari では 100vh が見えている高さより大きい
    <div className="light-only min-h-dvh flex items-start md:items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-zinc-500">Auxlog for トレーナー</p>
          <h1 className="text-2xl font-semibold tracking-tight text-black">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
