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

  if (!exercises) {
    return NextResponse.json({ suggestions: [], warnings: [] })
  }

  const normalizedExercises = normalizeExercises(exercises)

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
