import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { cookies } from 'next/headers'
import TrainerShell, { NAV_COLLAPSED_COOKIE } from '@/components/trainer/TrainerShell'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trainer')
  if (!(await getTrainerProfile(supabase, user.id))) redirect('/trainer/start')

  const collapsed = (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === '1'
  return <TrainerShell initialCollapsed={collapsed}>{children}</TrainerShell>
}
