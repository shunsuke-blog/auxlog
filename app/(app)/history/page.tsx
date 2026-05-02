import { createClient } from '@/lib/supabase/server'
import HistoryClient from '@/components/history/HistoryClient'
import type { TargetMuscle } from '@/types'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: sessionsData }, { data: exercisesData }] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('*, training_sets(*)')
      .eq('user_id', user.id)
      .order('trained_at', { ascending: false })
      .limit(60),
    supabase
      .from('user_exercises')
      .select('*, exercise_master(name, target_muscle)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const exercises = (exercisesData ?? []).map((e: {
    id: string
    user_id: string
    exercise_master_id: string | null
    custom_name: string | null
    custom_target_muscle: string | null
    default_sets: number
    default_reps: number
    sort_order: number
    is_active: boolean
    is_bodyweight: boolean
    created_at: string
    exercise_master: { name: string; target_muscle: string; is_bodyweight: boolean } | null
  }) => ({
    ...e,
    custom_target_muscle: e.custom_target_muscle as TargetMuscle | null,
    name: e.custom_name ?? e.exercise_master?.name ?? '',
    target_muscle: (e.custom_target_muscle ?? e.exercise_master?.target_muscle ?? '') as TargetMuscle,
  }))

  const sessions = (sessionsData ?? []).map((s: {
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
      is_warmup: boolean
      created_at: string
    }[]
  }) => {
    const sets = s.training_sets ?? []
    const totalVolume = sets.reduce(
      (acc, set) => acc + set.weight_kg * set.reps,
      0
    )
    return {
      ...s,
      sets,
      total_volume: Math.round(totalVolume),
    }
  })

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">履歴</h1>
      </div>

      <div className="px-6 py-6">
        <HistoryClient sessions={sessions} exercises={exercises} />
      </div>
    </div>
  )
}
