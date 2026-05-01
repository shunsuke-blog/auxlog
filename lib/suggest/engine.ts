import type { UserExercise, TrainingSet, SessionWithSets, Suggestion, SetTarget, VolumeStatus } from '@/types'

type SuggestInput = {
  exercises: UserExercise[]
  recentSessions: SessionWithSets[]
  todayDate: Date
}

export function suggestMenu(input: SuggestInput): Suggestion[] {
  const { exercises, recentSessions, todayDate } = input

  return exercises
    .filter(e => e.is_active)
    .map(exercise => {
      const lastSession = getLastSessionForExercise(exercise.id, recentSessions)
      const daysSinceLast = lastSession
        ? diffDays(todayDate, new Date(lastSession.trained_at))
        : 999
      const weeklyVolumeSets = calcWeeklyVolumeSets(exercise, recentSessions, todayDate)
      const lastSets = lastSession?.sets.filter(s => s.exercise_id === exercise.id) ?? []
      const isStagnant = checkStagnation(exercise.id, recentSessions)

      const { weight, sets, reps, reason, setTargets } = proposeNextSet(
        lastSets,
        exercise,
        lastSession?.fatigue_level,
        isStagnant
      )

      return {
        exercise,
        proposed_weight_kg: weight,
        proposed_sets: sets,
        proposed_reps: reps,
        proposed_set_targets: setTargets,
        reason,
        days_since_last: daysSinceLast,
        weekly_volume_sets: weeklyVolumeSets,
        volume_status: getVolumeStatus(weeklyVolumeSets),
      }
    })
    // 48時間未満（昨日・当日）はまだ回復中のため除外
    .filter(s => s.days_since_last >= 2)
    .sort((a, b) => b.days_since_last - a.days_since_last)
}

/**
 * セットごとの目標（重量・回数）を生成する
 *
 * prevWorkingSets がある場合: 前回の各セット重量を引き継ぎ、repsDelta 分だけ回数を調整
 * ない場合: topWeight の直線セット + 疲労モデル（1セットごとに1回減）
 */
function generateSetTargets(
  setsCount: number,
  topWeight: number,
  topReps: number,
  prevWorkingSets: TrainingSet[],
  repsDelta: number,   // 前回比 +1 = 漸進, 0 = 維持
): SetTarget[] {
  const sorted = [...prevWorkingSets]
    .sort((a, b) => a.set_number - b.set_number)
    .slice(0, setsCount)

  // 前回の各セットデータを引き継げる場合
  if (sorted.length === setsCount) {
    // 追加セットが必要な場合は末尾に疲労モデルで補完
    return sorted.map((s, i) => ({
      set_number: i + 1,
      weight_kg: s.weight_kg,
      reps: Math.max(1, s.reps + repsDelta),
    }))
  }

  // 前回データ不足: topWeight の直線セット + 疲労モデル
  return Array.from({ length: setsCount }, (_, i) => ({
    set_number: i + 1,
    weight_kg: topWeight,
    reps: Math.max(1, topReps - i),
  }))
}

function proposeNextSet(
  lastSets: TrainingSet[],
  exercise: UserExercise,
  lastFatigue?: number,
  isStagnant?: boolean
): { weight: number; sets: number; reps: number; reason: string; setTargets: SetTarget[] } {
  // ── 初回 ──────────────────────────────────────────────────
  if (lastSets.length === 0) {
    const reps = exercise.default_reps
    const sets = exercise.default_sets
    return {
      weight: 0,
      sets,
      reps,
      reason: '初回のため初期値を使用',
      setTargets: generateSetTargets(sets, 0, reps, [], 0),
    }
  }

  // ── ウォームアップを除いたワーキングセットのみで判断 ──────
  const workingSets = lastSets.filter(s => !s.is_warmup)
  const effectiveSets = workingSets.length > 0 ? workingSets : lastSets

  const lastWeight = Math.max(...effectiveSets.map(s => s.weight_kg))
  const lastSetsCount = effectiveSets.length

  // トップセット（最大重量）のみで RIR・レップを判定
  const topSets = effectiveSets.filter(s => s.weight_kg === lastWeight)
  const allTopSetsHadRoom = topSets.every(s => s.rir === true)
  const bestTopReps = Math.max(...topSets.map(s => s.reps))
  const reachedTarget = bestTopReps >= exercise.default_reps

  // ── 疲労度が高い → 回復セッション ─────────────────────────
  if (lastFatigue && lastFatigue >= 4) {
    if (lastWeight === 0) {
      const reps = Math.max(1, Math.round(bestTopReps * 0.8))
      return {
        weight: 0,
        sets: lastSetsCount,
        reps,
        reason: '前回の疲労度が高いため回数を20%減',
        setTargets: generateSetTargets(lastSetsCount, 0, reps, [], 0),
      }
    }
    const weight = Math.round((lastWeight * 0.95) / 2.5) * 2.5
    return {
      weight,
      sets: lastSetsCount,
      reps: bestTopReps,
      reason: '前回の疲労度が高いため重量を5%減',
      setTargets: generateSetTargets(lastSetsCount, weight, bestTopReps, [], 0),
    }
  }

  // ── レップ未達 ─────────────────────────────────────────────
  // ウォームアップ除外後の各セット重量を引き継ぎ、それぞれ+1回を目標
  if (!reachedTarget) {
    const nextReps = Math.min(bestTopReps + 1, exercise.default_reps)
    return {
      weight: lastWeight,
      sets: lastSetsCount,
      reps: nextReps,
      reason: `前回${bestTopReps}回のため重量維持・目標${nextReps}回`,
      setTargets: generateSetTargets(lastSetsCount, lastWeight, nextReps, effectiveSets, +1),
    }
  }

  // ── 全トップセット余裕あり → 負荷UP ──────────────────────
  if (allTopSetsHadRoom) {
    if (lastWeight === 0) {
      const reps = bestTopReps + 2
      return {
        weight: 0,
        sets: lastSetsCount,
        reps,
        reason: `前回${bestTopReps}回余裕ありのため目標回数+2`,
        setTargets: generateSetTargets(lastSetsCount, 0, reps, effectiveSets, +2),
      }
    }
    const weight = lastWeight + 2.5
    const reps = exercise.default_reps
    // 重量が上がるので直線セット + 疲労モデル
    return {
      weight,
      sets: lastSetsCount,
      reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
      setTargets: generateSetTargets(lastSetsCount, weight, reps, [], 0),
    }
  }

  // ── ストール → セット数+1 ─────────────────────────────────
  if (isStagnant) {
    const sets = lastSetsCount + 1
    // 追加セットは末尾に同重量・疲労モデルで補完
    const baseTargets = generateSetTargets(lastSetsCount, lastWeight, bestTopReps, effectiveSets, 0)
    const lastTarget = baseTargets[baseTargets.length - 1]
    const setTargets: SetTarget[] = [
      ...baseTargets,
      { set_number: sets, weight_kg: lastTarget.weight_kg, reps: Math.max(1, lastTarget.reps - 1) },
    ]
    return {
      weight: lastWeight,
      sets,
      reps: bestTopReps,
      reason: '3週間停滞のためセット数+1',
      setTargets,
    }
  }

  // ── ギリギリ達成 → 前回実績をそのまま目標に ───────────────
  return {
    weight: lastWeight,
    sets: lastSetsCount,
    reps: bestTopReps,
    reason: '前回ギリギリのため重量・レップ維持',
    setTargets: generateSetTargets(lastSetsCount, lastWeight, bestTopReps, effectiveSets, 0),
  }
}

function getLastSessionForExercise(exerciseId: string, sessions: SessionWithSets[]) {
  return sessions.find(s => s.sets.some(set => set.exercise_id === exerciseId)) ?? null
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function calcWeeklyVolumeSets(exercise: UserExercise, sessions: SessionWithSets[], today: Date): number {
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  return sessions
    .filter(s => new Date(s.trained_at) >= weekAgo)
    .flatMap(s => s.sets)
    .filter(set => set.exercise_id === exercise.id && !set.is_warmup)
    .length
}

function checkStagnation(exerciseId: string, sessions: SessionWithSets[]): boolean {
  const exerciseSessions = sessions
    .filter(s => s.sets.some(set => set.exercise_id === exerciseId && !set.is_warmup))
    .slice(0, 3)

  if (exerciseSessions.length < 3) return false

  const weights = exerciseSessions.map(s => {
    const workingSets = s.sets.filter(set => set.exercise_id === exerciseId && !set.is_warmup)
    return workingSets.length > 0 ? Math.max(...workingSets.map(set => set.weight_kg)) : 0
  })

  return weights.every(w => w === weights[0])
}

function getVolumeStatus(weeklySets: number): VolumeStatus {
  if (weeklySets < 10) return 'low'
  if (weeklySets <= 20) return 'optimal'
  return 'high'
}
