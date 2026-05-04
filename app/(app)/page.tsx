import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import HomeMenu from '@/components/home/HomeMenu'
import { redirect } from 'next/navigation'
import { normalizeExercises } from '@/lib/normalize/exercises'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: exercises } = await supabase
    .from('user_exercises')
    .select('*, exercise_master(name, target_muscle, is_bodyweight, is_compound)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

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
    ? suggestMenu({ exercises: normalizedExercises, recentSessions: normalizedSessions, todayDate: new Date() })
    : []

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <HomeMenu
        initialSuggestions={suggestions}
        allExercises={normalizedExercises}
      />
    </div>
  )
}
