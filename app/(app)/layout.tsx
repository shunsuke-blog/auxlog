import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTrainerProfile, SELF_VIEW_COOKIE } from '@/lib/trainer/session'
import BottomNav from '@/components/ui/BottomNav'
import { NavigationGuardProvider } from '@/lib/contexts/NavigationGuard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // トレーニー課金の廃止（2026-10-19）に伴い課金ゲート（/subscribeへのリダイレクト）は削除した。

  // トレーナーはトレーナー画面が基本。一覧の自分の行から「自分のトレーニング」に入っている間
  // （SELF_VIEW_COOKIE）だけ、トレーニー用の画面を使う（2026-10-19 決定）。
  if (!(await cookies()).get(SELF_VIEW_COOKIE) && (await getTrainerProfile(supabase, user.id))) {
    redirect('/trainer/dashboard')
  }

  return (
    <NavigationGuardProvider>
      <div className="min-h-screen bg-white dark:bg-black" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <main>{children}</main>
        <BottomNav />
      </div>
    </NavigationGuardProvider>
  )
}
