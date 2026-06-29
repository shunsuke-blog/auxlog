import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import HomeMenu from '@/components/home/HomeMenu'
import ProgramDayView from '@/components/home/ProgramDayView'
import { redirect } from 'next/navigation'
import { normalizeExercises } from '@/lib/normalize/exercises'
import type { TrainingLevel, UserProgramEnrollment } from '@/types'
import { todayInJST } from '@/lib/utils/date'
import { isFreeActive, calculateTrialDaysLeft } from '@/lib/business/userStatus'
import { userExercisesQuery } from '@/lib/api/queries'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: userData }, { data: exercises }, { data: enrollment }] = await Promise.all([
    supabase.from('users').select('training_level, subscription_status, trial_ends_at, is_admin, is_free, free_until').eq('id', user.id).single(),
    userExercisesQuery(supabase, user.id),
    supabase.from('user_program_enrollments').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ])

  const trainingLevel: TrainingLevel = (userData?.training_level as TrainingLevel) ?? 'intermediate'

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

  // アクティブなプログラムエンロールメントがある場合はプログラムビューを表示
  if (enrollment) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <ProgramDayView
          enrollment={enrollment as UserProgramEnrollment}
          trialDaysLeft={trialDaysLeft}
        />
      </div>
    )
  }

  const normalizedExercises = normalizeExercises(exercises ?? [])

  // recent_session_ids（最大3件/種目）から対象セッション ID を収集
  const recentSessionIds = [...new Set(normalizedExercises.flatMap(e => e.recent_session_ids))]

  // 週間ボリューム計算用に過去7日のセッションも別途取得
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]

  const SETS_SELECT = '*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)' as const

  const [weeklyResult, pinnedResult] = await Promise.all([
    supabase.from('training_sessions').select(SETS_SELECT).eq('user_id', user.id).gte('trained_at', cutoffStr).order('trained_at', { ascending: false }),
    recentSessionIds.length > 0
      ? supabase.from('training_sessions').select(SETS_SELECT).in('id', recentSessionIds)
      : null,
  ])

  const seen = new Set<string>()
  const normalizedSessions = [
    ...(pinnedResult?.data ?? []),
    ...(weeklyResult.data ?? []),
  ].filter(s => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  }).sort((a, b) => b.trained_at.localeCompare(a.trained_at))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(s => ({ ...s, sets: (s as any).training_sets ?? [] }))

  const suggestions = normalizedExercises.length > 0
    ? suggestMenu({ exercises: normalizedExercises, recentSessions: normalizedSessions, todayDate: todayInJST(), trainingLevel })
    : []

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <HomeMenu
        initialSuggestions={suggestions}
        allExercises={normalizedExercises}
        trialDaysLeft={trialDaysLeft}
      />
    </div>
  )
}
