import { createClient } from '@/lib/supabase/server'
import HistoryClient from '@/components/history/HistoryClient'
import { normalizeExercises } from '@/lib/normalize/exercises'
import type { TrainingSet } from '@/types'

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

  const rawSessions = (sessionsData ?? []).map(s => {
    const sets = (s.training_sets ?? []) as TrainingSet[]
    const totalVolume = sets.reduce((acc, set) => acc + set.weight_kg * set.reps, 0)
    return { ...s, sets, total_volume: Math.round(totalVolume) }
  })

  // 同じ日付のセッションを1枚にまとめる
  const sessionsByDate = new Map<string, typeof rawSessions>()
  for (const session of rawSessions) {
    const date = session.trained_at
    if (!sessionsByDate.has(date)) sessionsByDate.set(date, [])
    sessionsByDate.get(date)!.push(session)
  }

  const sessions = Array.from(sessionsByDate.entries()).map(([date, group]) => {
    if (group.length === 1) return { ...group[0], allIds: [group[0].id] }
    // 複数セッションをマージ: 疲労度は最大値、メモは結合、セットは全て含む
    return {
      id: group[0].id,
      allIds: group.map(s => s.id),  // 全セッションIDを保持（編集時に使用）
      user_id: group[0].user_id,
      trained_at: date,
      fatigue_level: Math.max(...group.map(s => s.fatigue_level)),
      memo: group.map(s => s.memo).filter(Boolean).join(' / ') || null,
      created_at: group[0].created_at,
      sets: group.flatMap(s => s.sets),
      total_volume: group.reduce((sum, s) => sum + s.total_volume, 0),
    }
  })

  return <HistoryClient sessions={sessions} exercises={exercises} />
}
