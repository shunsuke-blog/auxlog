import { createClient } from '@/lib/supabase/server'
import ProgramDayView from '@/components/home/ProgramDayView'
import CoachingHome from '@/components/coaching/CoachingHome'
import { redirect } from 'next/navigation'
import type { UserProgramEnrollment } from '@/types'
import { getLivePlan, getTraineeLink, loadCoachingWeek } from '@/lib/coaching/trainee'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // トレーナーと契約中ならコーチングモード（トレーナーのプラン）。同時に進められるプログラムは1つ
  const link = await getTraineeLink(supabase, user.id)
  if (link) {
    const plan = link.status === 'active' ? await getLivePlan(supabase, link.linkId) : null
    if (!plan) {
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
    const days = await loadCoachingWeek(supabase, plan.id, plan.currentWeek)
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <CoachingHome
          key={`${plan.id}-${plan.currentWeek}`}
          plan={plan}
          trainerName={link.trainerName}
          days={days}
          initialDay={Number((await searchParams).day) || undefined}
        />
      </div>
    )
  }

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
