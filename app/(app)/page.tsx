import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import HomeMenu from '@/components/home/HomeMenu'
import { redirect } from 'next/navigation'
import { normalizeExercises } from '@/lib/normalize/exercises'
import type { TrainingLevel } from '@/types'
import { todayInJST } from '@/lib/utils/date'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: userData }, { data: exercises }] = await Promise.all([
    supabase.from('users').select('training_level, subscription_status, trial_ends_at, is_admin, is_free, free_until').eq('id', user.id).single(),
    supabase
      .from('user_exercises')
      .select('*, exercise_master(name, target_muscle, is_bodyweight, is_compound)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const trainingLevel: TrainingLevel = (userData?.training_level as TrainingLevel) ?? 'intermediate'

  // トライアル終了バナーの残り日数を計算（trialing のみ対象）
  const isAdmin = userData?.is_admin ?? false
  const isFree = userData?.is_free ?? false
  const freeUntil = userData?.free_until ?? null
  const freeActive = isFree && (!freeUntil || new Date(freeUntil) > new Date())
  const status = userData?.subscription_status ?? null
  const trialEndsAt = userData?.trial_ends_at ?? null
  const trialDaysLeft = (status === 'trialing' && trialEndsAt && !isAdmin && !freeActive)
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  if (!exercises || exercises.length === 0) {
    redirect('/onboarding')
  }

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)')
    .eq('user_id', user.id)
    .gte('trained_at', fourWeeksAgo.toISOString().split('T')[0])
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
