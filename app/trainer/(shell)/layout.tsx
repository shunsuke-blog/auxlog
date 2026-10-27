import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import TrainerShell, { NAV_COLLAPSED_COOKIE } from '@/components/trainer/TrainerShell'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/trainer/login?next=/trainer/dashboard')
  const profile = await getTrainerProfile(supabase, user.id)
  if (!profile) redirect('/trainer/start')
  // ビジネスでチームがまだ無い間は、チームを作るだけの画面にする。管理だけの管理者はタブを減らす（2026-10-26 オーナー指摘）
  let managerOnly = false
  if (profile.plan === 'business') {
    const { data: owned } = await supabase.from('organizations').select('owner_is_trainer').eq('owner_user_id', user.id).maybeSingle()
    if (!owned) redirect('/trainer/team-setup')
    managerOnly = !owned.owner_is_trainer
  }

  const [usage, cookieStore] = await Promise.all([loadPlanUsage(supabase, user.id, profile.plan), cookies()])
  const collapsed = cookieStore.get(NAV_COLLAPSED_COOKIE)?.value === '1'
  return (
    <TrainerShell initialCollapsed={collapsed} managerOnly={managerOnly}>
      {/* 有料プランをやめるなどして上限を超えている間は、テンプレートの作成・編集・招待などが止まる（DB の
          assert_trainer_within_limit）。なぜ止まっているか・どうすれば戻るかを全画面の上に出す（2026-10-26） */}
      {usage.over && usage.limit != null && (
        <div className="px-4 md:px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 leading-relaxed">
          {usage.label}のクライアントの上限（{usage.limit}名）を超えています（今は{usage.used}名）。
          {usage.used - usage.limit}名の契約を終了するか、上のプランにするまで、プログラムの作成・編集と招待はできません。
          クライアントの記録はこれまでどおり続きます。
          <Link href="/trainer/settings" className="ml-1 font-medium underline">プランを見る</Link>
        </div>
      )}
      {children}
    </TrainerShell>
  )
}
