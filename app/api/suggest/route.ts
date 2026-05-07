import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import { normalizeExercises } from '@/lib/normalize/exercises'
import { NextResponse } from 'next/server'
import type { TrainingLevel } from '@/types'
import { VOLUME_TARGETS } from '@/lib/constants/training'
import { todayInJST } from '@/lib/utils/date'
import { userExercisesQuery } from '@/lib/api/queries'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: userData }, { data: exercises }] = await Promise.all([
    supabase.from('users').select('training_level').eq('id', user.id).single(),
    userExercisesQuery(supabase, user.id),
  ])

  const trainingLevel: TrainingLevel = (userData?.training_level as TrainingLevel) ?? 'intermediate'

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)')
    .eq('user_id', user.id)
    .order('trained_at', { ascending: false })
    .limit(100)

  if (!exercises || !sessions) {
    return NextResponse.json({ suggestions: [], warnings: [] })
  }

  const normalizedExercises = normalizeExercises(exercises)
  const normalizedSessions = sessions.map(s => ({
    ...s,
    sets: s.training_sets ?? [],
  }))

  const suggestions = suggestMenu({
    exercises: normalizedExercises,
    recentSessions: normalizedSessions,
    todayDate: todayInJST(),
    trainingLevel,
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
    const maxSets = VOLUME_TARGETS[trainingLevel].max
    if (sets > maxSets) warnings.push(`${muscle}のセット数が週${sets}セットを超えています`)
  })

  return NextResponse.json({ suggestions, warnings })
}
