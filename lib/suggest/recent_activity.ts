import type { TrainingSet } from '@/types'

export type RecentActivity = {
  // 種目ごと、直近14日以内で最新の1セッションの非ウォームアップセット
  // （アイソレーション重量キャリブレーション用）。
  recentSetsByExercise: Record<string, TrainingSet[]>
  // 動きパターンごと、直近セッション（種目を変えていても対象）にウォームアップが
  // 含まれていたか（コンパウンド種目のウォームアップ引き継ぎ提案用）。
  recentWarmupByPattern: Record<string, boolean>
}

// route.ts（/api/suggest/program）から呼ばれる。1回のtraining_setsクエリ結果から、
// 種目単位・動きパターン単位それぞれで「直近の最新セッション」を特定し、上記2つの
// 集計を組み立てる純粋関数（2026-08-09、元は route.ts に直接書かれていてテストが
// 無かったため切り出した）。
export function buildRecentActivity(
  recentSets: TrainingSet[],
  trainedAtBySessionId: Map<string, string>,
  exerciseIdsByPattern: Map<string, string[]>
): RecentActivity {
  const exerciseIdToPattern = new Map<string, string>()
  for (const [pattern, ids] of exerciseIdsByPattern) {
    for (const id of ids) exerciseIdToPattern.set(id, pattern)
  }

  const trainedAtOf = (sessionId: string) => trainedAtBySessionId.get(sessionId) ?? ''

  function latestSessionByKey<T>(keyOf: (set: TrainingSet) => T | undefined): Map<T, string> {
    const result = new Map<T, string>()
    for (const set of recentSets) {
      const key = keyOf(set)
      if (key === undefined) continue
      const currentLatestId = result.get(key)
      const currentLatestTrainedAt = currentLatestId ? trainedAtOf(currentLatestId) : ''
      if (!currentLatestId || trainedAtOf(set.session_id) > currentLatestTrainedAt) {
        result.set(key, set.session_id)
      }
    }
    return result
  }

  // 種目ごとに最新セッションを特定する（非ウォームアップのみ、
  // アイソレーション重量キャリブレーション用の従来挙動を維持）
  const nonWarmupSets = recentSets.filter(s => !s.is_warmup)
  const latestSessionIdByExercise = latestSessionByKey((set) => (set.is_warmup ? undefined : set.exercise_id))

  const recentSetsByExercise: Record<string, TrainingSet[]> = {}
  for (const set of nonWarmupSets) {
    if (latestSessionIdByExercise.get(set.exercise_id) !== set.session_id) continue
    if (!recentSetsByExercise[set.exercise_id]) recentSetsByExercise[set.exercise_id] = []
    recentSetsByExercise[set.exercise_id].push(set)
  }

  // 動きパターンごとに最新セッションを特定し、そのセッションにウォームアップが
  // 含まれていたかを判定する（種目を変えていても引き継ぐため、種目単位ではなく
  // パターン単位で見る）
  const latestSessionIdByPattern = latestSessionByKey((set) => exerciseIdToPattern.get(set.exercise_id))

  const recentWarmupByPattern: Record<string, boolean> = {}
  for (const set of recentSets) {
    if (!set.is_warmup) continue
    const pattern = exerciseIdToPattern.get(set.exercise_id)
    if (!pattern) continue
    if (latestSessionIdByPattern.get(pattern) !== set.session_id) continue
    recentWarmupByPattern[pattern] = true
  }

  return { recentSetsByExercise, recentWarmupByPattern }
}
