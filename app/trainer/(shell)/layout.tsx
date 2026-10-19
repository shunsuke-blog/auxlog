import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import TrainerNav from '@/components/trainer/TrainerNav'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trainer')
  if (!(await getTrainerProfile(supabase, user.id))) redirect('/trainer/start')

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <TrainerNav />
      <main className="md:pl-56" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
    </div>
  )
}
