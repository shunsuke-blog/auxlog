import { createClient } from '@/lib/supabase/server'
import HistoryClient from '@/components/history/HistoryClient'
import { normalizeExercises } from '@/lib/normalize/exercises'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: sessionsData }, { data: exercisesData }] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)')
      .eq('user_id', user.id)
      .order('trained_at', { ascending: false })
      .limit(60),
    supabase
      .from('user_exercises')
      .select('*, exercise_master(name, target_muscle, is_bodyweight)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const exercises = normalizeExercises(exercisesData ?? [])

  const sessions = (sessionsData ?? []).map(s => {
    const sets = s.training_sets ?? []
    const totalVolume = (sets as Array<{ weight_kg: number; reps: number }>).reduce(
      (acc, set) => acc + set.weight_kg * set.reps,
      0
    )
    return { ...s, sets, total_volume: Math.round(totalVolume) }
  })

  return <HistoryClient sessions={sessions} exercises={exercises} />
}
