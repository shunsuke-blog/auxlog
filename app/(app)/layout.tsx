import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-white dark:bg-black" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <main>{children}</main>
      <BottomNav />
    </div>
  )
}
