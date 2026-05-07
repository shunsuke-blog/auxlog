import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import HomeMenu from '@/components/home/HomeMenu'
import { redirect } from 'next/navigation'
import { normalizeExercises } from '@/lib/normalize/exercises'
import type { TrainingLevel } from '@/types'
import { todayInJST } from '@/lib/utils/date'
import { isFreeActive, calculateTrialDaysLeft } from '@/lib/business/userStatus'
import { userExercisesQuery } from '@/lib/api/queries'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: userData }, { data: exercises }] = await Promise.all([
    supabase.from('users').select('training_level, subscription_status, trial_ends_at, is_admin, is_free, free_until').eq('id', user.id).single(),
    userExercisesQuery(supabase, user.id),
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

  if (!exercises || exercises.length === 0) {
    redirect('/onboarding')
  }

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)')
    .eq('user_id', user.id)
    .order('trained_at', { ascending: false })
    .limit(100)

  const normalizedExercises = normalizeExercises(exercises)

  const normalizedSessions = (sessions ?? []).map(s => ({
    ...s,
    sets: s.training_sets ?? [],
  }))

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
