import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import { NextResponse } from 'next/server'
import type { TargetMuscle } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: exercises } = await supabase
    .from('user_exercises')
    .select(`
      *,
      exercise_master(name, target_muscle)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select(`
      *,
      training_sets(*)
    `)
    .eq('user_id', user.id)
    .gte('trained_at', fourWeeksAgo.toISOString().split('T')[0])
    .order('trained_at', { ascending: false })

  if (!exercises || !sessions) {
    return NextResponse.json({ suggestions: [], warnings: [] })
  }

  const normalizedExercises = exercises.map((e: {
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

  const normalizedSessions = sessions.map((s: {
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

  const suggestions = suggestMenu({
    exercises: normalizedExercises,
    recentSessions: normalizedSessions,
    todayDate: new Date(),
  })

  const warnings: string[] = []
  const muscleVolumes = new Map<string, number>()
  normalizedExercises.forEach(ex => {
    const exSuggestion = suggestions.find(s => s.exercise.id === ex.id)
    if (exSuggestion) {
      const current = muscleVolumes.get(ex.target_muscle) ?? 0
      muscleVolumes.set(ex.target_muscle, current + exSuggestion.weekly_volume_sets)
    }
  })
  muscleVolumes.forEach((sets, muscle) => {
    if (sets > 20) warnings.push(`${muscle}のセット数が週${sets}セットを超えています`)
  })

  return NextResponse.json({ suggestions, warnings })
}
