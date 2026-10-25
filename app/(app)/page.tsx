import { createClient } from '@/lib/supabase/server'
import ProgramDayView from '@/components/home/ProgramDayView'
import CoachingHome from '@/components/coaching/CoachingHome'
import { redirect } from 'next/navigation'
import type { UserProgramEnrollment } from '@/types'
import { resolveTraineeHome } from '@/lib/coaching/trainee_home'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // ホームの出し分けはアプリ用の API と共通（lib/coaching/trainee_home.ts）
  const home = await resolveTraineeHome(supabase, user.id)
  if (home.mode === 'waiting') {
    const { link } = home
    return (
      <div className="min-h-screen bg-white dark:bg-black px-6 pt-24 text-center space-y-2">
        <p className="text-base font-semibold text-black dark:text-white">
          {link.status === 'paused' ? 'トレーナーとの契約が一時停止中です' : '次のプランを準備中です'}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {link.status === 'paused'
            ? `${link.trainerName} さんの契約が再開されると、プランの続きから記録できます。`
            : `${link.trainerName} さんがプランを共有すると、ここにメニューが表示されます。`}
        </p>
      </div>
    )
  }
  if (home.mode === 'coaching') {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <CoachingHome
          key={`${home.plan.id}-${home.plan.currentWeek}`}
          plan={home.plan}
          trainerName={home.link.trainerName}
          days={home.days}
          offPlan={home.offPlan}
          initialDay={Number((await searchParams).day) || undefined}
        />
      </div>
    )
  }
  if (home.mode === 'none') redirect('/onboarding')

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!enrollment) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* サイクル更新（renew-cycle）で新しいenrollmentになったらkeyで再マウントし、週・キャッシュを初期化する */}
      <ProgramDayView key={(enrollment as UserProgramEnrollment).id} enrollment={enrollment as UserProgramEnrollment} />
    </div>
  )
}
