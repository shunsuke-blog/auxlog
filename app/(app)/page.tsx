import { createClient } from '@/lib/supabase/server'
import ProgramDayView from '@/components/home/ProgramDayView'
import { redirect } from 'next/navigation'
import type { UserProgramEnrollment } from '@/types'
import { isFreeActive, calculateTrialDaysLeft } from '@/lib/business/userStatus'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: userData }, { data: enrollment }] = await Promise.all([
    supabase.from('users').select('subscription_status, trial_ends_at, is_admin, is_free, free_until').eq('id', user.id).single(),
    supabase.from('user_program_enrollments').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ])

  const isAdmin = userData?.is_admin ?? false
  const freeActive = isFreeActive(userData?.is_free ?? false, userData?.free_until ?? null)
  const trialDaysLeft = calculateTrialDaysLeft(
    userData?.subscription_status ?? null,
    userData?.trial_ends_at ?? null,
    isAdmin,
    freeActive
  )

  if (!enrollment) {
    redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <ProgramDayView
        enrollment={enrollment as UserProgramEnrollment}
        trialDaysLeft={trialDaysLeft}
      />
    </div>
  )
}
