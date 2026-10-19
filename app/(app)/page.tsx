import { createClient } from '@/lib/supabase/server'
import ProgramDayView from '@/components/home/ProgramDayView'
import { redirect } from 'next/navigation'
import type { UserProgramEnrollment } from '@/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) {
    redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* サイクル更新（renew-cycle）で新しいenrollmentになったらkeyで再マウントし、週・キャッシュを初期化する */}
      <ProgramDayView key={(enrollment as UserProgramEnrollment).id} enrollment={enrollment as UserProgramEnrollment} />
    </div>
  )
}
