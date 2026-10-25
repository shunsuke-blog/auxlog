import type { SupabaseClient } from '@supabase/supabase-js'

// 自己ベスト（exercise_bests）を、残っている記録から計算し直す（2026-10-25 不具合修正）。
// 記録の保存時は「今までのベストと今回の大きい方」で上書きしているため、記録を削除・編集しても
// ベストが下がらず、消した記録の値（「前回 270kg」や Record! の判定、トレーナーの画面の自己ベスト）が残っていた。
// 記録の削除・編集の後に、その記録に含まれていた種目について呼ぶ。

type SetRow = { session_id: string; weight_kg: number | string; reps: number }

export type ExerciseBest = { best_weight_kg: number; best_reps: number; best_volume: number; best_total_reps: number }

/** ワーキングセットから自己ベストを出す（保存時の計算と同じ: 最大重量とその重量での最大回数、1回の総挙上量・総回数の最大） */
export function computeExerciseBest(sets: { session_id: string; weight_kg: number; reps: number }[]): ExerciseBest | null {
  if (sets.length === 0) return null
  let weight = 0
  let reps = 0
  const bySession = new Map<string, { volume: number; reps: number }>()
  for (const s of sets) {
    if (s.weight_kg > weight || (s.weight_kg === weight && s.reps > reps)) {
      weight = s.weight_kg
      reps = s.reps
    }
    const sess = bySession.get(s.session_id) ?? { volume: 0, reps: 0 }
    sess.volume += s.weight_kg * s.reps
    sess.reps += s.reps
    bySession.set(s.session_id, sess)
  }
  const sessions = [...bySession.values()]
  return {
    best_weight_kg: weight,
    best_reps: reps,
    best_volume: Math.max(...sessions.map(s => s.volume)),
    best_total_reps: Math.max(...sessions.map(s => s.reps)),
  }
}

const PAGE = 1000

export async function recomputeExerciseBests(supabase: SupabaseClient, userId: string, exerciseIds: string[]): Promise<void> {
  for (const exerciseId of [...new Set(exerciseIds)]) {
    // 1回の取得は最大1000行なので、ページに分けてすべて読む
    const rows: SetRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('training_sets')
        .select('session_id, weight_kg, reps, training_sessions!inner(user_id)')
        .eq('training_sessions.user_id', userId)
        .eq('exercise_id', exerciseId)
        .eq('is_warmup', false)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) return
      rows.push(...((data ?? []) as unknown as SetRow[]))
      if ((data ?? []).length < PAGE) break
    }
    const best = computeExerciseBest(rows.map(r => ({ session_id: r.session_id, weight_kg: Number(r.weight_kg), reps: r.reps })))
    if (best) {
      await supabase.from('exercise_bests').upsert({ user_id: userId, exercise_id: exerciseId, ...best, updated_at: new Date().toISOString() })
    } else {
      await supabase.from('exercise_bests').delete().eq('user_id', userId).eq('exercise_id', exerciseId)
    }
  }
}
