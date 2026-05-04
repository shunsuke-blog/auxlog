import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'
import { canUseApp } from '@/lib/subscription'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, trial_ends_at, is_admin')
    .eq('id', user.id)
    .single()

  // 管理者はサブスク状態に関わらず常にアクセス許可
  if (!userData?.is_admin) {
    const status = userData?.subscription_status ?? null
    const trialEndsAt = userData?.trial_ends_at ?? ''

    // NULLはサブスク未設定の新規ユーザー。アクセスは許可してオンボーディングに委ねる
    if (status !== null && !canUseApp(status, trialEndsAt)) {
      redirect(`/subscribe?reason=${status}`)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <main>{children}</main>
      <BottomNav />
    </div>
  )
}
