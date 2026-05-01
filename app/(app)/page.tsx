import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import HomeMenu from '@/components/home/HomeMenu'
import type { TargetMuscle } from '@/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: exercises } = await supabase
    .from('user_exercises')
    .select('*, exercise_master(name, target_muscle)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('*, training_sets(*)')
    .eq('user_id', user.id)
    .gte('trained_at', fourWeeksAgo.toISOString().split('T')[0])
    .order('trained_at', { ascending: false })

  const normalizedExercises = (exercises ?? []).map((e: {
    id: string
    user_id: string
    exercise_master_id: string | null
    custom_name: string | null
    custom_target_muscle: string | null
    default_sets: number
    default_reps: number
    sort_order: number
    is_active: boolean
    created_at: string
    exercise_master: { name: string; target_muscle: string } | null
  }) => ({
    ...e,
    custom_target_muscle: e.custom_target_muscle as TargetMuscle | null,
    name: e.custom_name ?? e.exercise_master?.name ?? '',
    target_muscle: (e.custom_target_muscle ?? e.exercise_master?.target_muscle ?? '') as TargetMuscle,
  }))

  const normalizedSessions = (sessions ?? []).map((s: {
    id: string
    user_id: string
    trained_at: string
    fatigue_level: number
    memo: string | null
    created_at: string
    training_sets: {
      id: string
      session_id: string
      exercise_id: string
      set_number: number
      weight_kg: number
      reps: number
      rir: boolean
      created_at: string
    }[]
  }) => ({
    ...s,
    sets: s.training_sets ?? [],
  }))

  const suggestions = normalizedExercises.length > 0
    ? suggestMenu({ exercises: normalizedExercises, recentSessions: normalizedSessions, todayDate: new Date() })
    : []

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <HomeMenu
        today={today}
        initialSuggestions={suggestions}
        allExercises={normalizedExercises}
      />
    </div>
  )
}
