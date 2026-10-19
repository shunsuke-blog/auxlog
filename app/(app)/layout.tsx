import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'
import { NavigationGuardProvider } from '@/lib/contexts/NavigationGuard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // トレーニー課金の廃止（2026-10-19）に伴い課金ゲート（/subscribeへのリダイレクト）は削除した。

  return (
    <NavigationGuardProvider>
      <div className="min-h-screen bg-white dark:bg-black" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <main>{children}</main>
        <BottomNav />
      </div>
    </NavigationGuardProvider>
  )
}
