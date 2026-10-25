import type { SupabaseClient } from '@supabase/supabase-js'
import { activitySince, loadTraineeRows, type TraineeRow } from './trainees'
import { parseTraineeActivity, type TraineeActivity } from './traineeStatus'
import { dashboardTodos, highlights, weekSummary, type TodoItem, type WeekSummary } from './dashboard'

// トレーナーのダッシュボードのデータ読み込み。トレーナー本人のセッション（RLS）で読むため、契約期間外の
// 記録や他人のトレーニーのデータは DB 側で除外される（契約者一覧と同じ）。

export type RecentSession = {
  id: string
  linkId: string
  name: string
  trainedOn: string
  memo: string | null
  exercises: { name: string; sets: string }[]
}

export type DashboardData = {
  rows: TraineeRow[]
  todos: TodoItem[]
  week: WeekSummary
  recent: RecentSession[]
  highlights: { linkId: string; name: string; exercise: string; beforeKg: number; recentKg: number; gainKg: number; trainedOn: string }[]
}

type SessionRow = {
  id: string
  user_id: string
  trained_at: string
  memo: string | null
  training_sets: { set_number: number; weight_kg: number; reps: number; is_warmup: boolean; exercise_id: string; user_exercises: { custom_name: string | null; exercise_master: { name: string } | null; trainer_exercises: { name: string } | null } | null }[]
}

export const RECENT_SESSIONS = 15

export async function loadDashboard(supabase: SupabaseClient, trainerId: string, now = new Date()): Promise<DashboardData> {
  const { data: activity } = await supabase.rpc('trainer_trainee_activity', { p_since: activitySince(now) })
  const rows = await loadTraineeRows(supabase, trainerId, now, (activity ?? null) as TraineeActivity | null)

  // 自分（トレーナー自身の記録）は除き、契約中・一時停止中・終了済みの契約者の記録を出す（終了済みは契約期間内の記録だけ RLS で見える）
  const linkByUser = new Map<string, TraineeRow>()
  for (const r of rows) if (r.traineeId && !r.isSelf && (!linkByUser.has(r.traineeId) || r.status === 'active')) linkByUser.set(r.traineeId, r)
  const traineeIds = [...linkByUser.keys()]

  const { data: sessions } = traineeIds.length > 0
    ? await supabase
        .from('training_sessions')
        .select('id, user_id, trained_at, memo, training_sets(set_number, weight_kg, reps, is_warmup, exercise_id, user_exercises(custom_name, exercise_master(name), trainer_exercises(name)))')
        .in('user_id', traineeIds)
        .order('trained_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(RECENT_SESSIONS)
    : { data: [] }

  const recent: RecentSession[] = ((sessions ?? []) as unknown as SessionRow[]).map(s => {
    const byExercise = new Map<string, { name: string; sets: SessionRow['training_sets'] }>()
    for (const t of s.training_sets) {
      const name = t.user_exercises?.exercise_master?.name ?? t.user_exercises?.trainer_exercises?.name ?? t.user_exercises?.custom_name ?? '種目'
      const entry = byExercise.get(t.exercise_id) ?? { name, sets: [] }
      entry.sets.push(t)
      byExercise.set(t.exercise_id, entry)
    }
    const link = linkByUser.get(s.user_id)
    return {
      id: s.id,
      linkId: link?.linkId ?? '',
      name: link?.name ?? '',
      trainedOn: s.trained_at,
      memo: s.memo,
      exercises: [...byExercise.values()].map(e => ({
        name: e.name,
        // ワーキングセットだけを「80kg×5 / 80kg×5」の形で（ウォームアップは省く）
        sets: e.sets
          .filter(x => !x.is_warmup)
          .sort((a, b) => a.set_number - b.set_number)
          .map(x => `${Number(x.weight_kg)}kg×${x.reps}`)
          .join(' / '),
      })),
    }
  })

  // 成果のハイライト: 種目名は種目マスタから引く（1RM管理種目はマスタの種目だけ）
  const { oneRmByUser } = parseTraineeActivity((activity ?? null) as TraineeActivity | null)
  const ownSamples = new Map([...oneRmByUser].filter(([userId]) => linkByUser.has(userId)))
  const found = highlights(ownSamples, now).slice(0, 10)
  const exerciseIds = [...new Set(found.map(h => h.exerciseKey))]
  const { data: names } = exerciseIds.length > 0
    ? await supabase.from('exercise_master').select('id, name').in('id', exerciseIds)
    : { data: [] }
  const nameById = new Map((names ?? []).map(n => [n.id as string, n.name as string]))

  return {
    rows,
    todos: dashboardTodos(rows),
    week: weekSummary(rows),
    recent,
    highlights: found.map(h => {
      const link = linkByUser.get(h.userId)
      return { linkId: link?.linkId ?? '', name: link?.name ?? '', exercise: nameById.get(h.exerciseKey) ?? '種目', beforeKg: h.beforeKg, recentKg: h.recentKg, gainKg: h.gainKg, trainedOn: h.trainedOn }
    }),
  }
}
