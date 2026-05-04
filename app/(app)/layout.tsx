import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'
import { canUseApp } from '@/lib/subscription'
import { NavigationGuardProvider } from '@/lib/contexts/NavigationGuard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, trial_ends_at, is_admin, is_free, free_until')
    .eq('id', user.id)
    .single()

  // 管理者は常にアクセス許可
  if (!userData?.is_admin) {
    // 無料ユーザーチェック（is_free=true かつ free_until が未来 or NULL）
    const isFree = userData?.is_free ?? false
    const freeUntil = userData?.free_until ?? null
    const freeActive = isFree && (!freeUntil || new Date(freeUntil) > new Date())

    if (!freeActive) {
      const status = userData?.subscription_status ?? null
      const trialEndsAt = userData?.trial_ends_at ?? ''

      // NULLはサブスク未設定の新規ユーザー。アクセスは許可してオンボーディングに委ねる
      if (status !== null && !canUseApp(status, trialEndsAt)) {
        redirect(`/subscribe?reason=${status}`)
      }
    }
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
