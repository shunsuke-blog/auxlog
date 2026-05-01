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
    .filter(s => s.days_since_last >= 2)
    .sort((a, b) => b.days_since_last - a.days_since_last)
}

/**
 * ワーキングセットの目標を生成する
 * - 前回のワーキングセットが揃っている場合: 各セット重量を引き継ぎ repsDelta 分回数調整
 * - 不足している場合: topWeight の直線セット + 疲労モデル
 */
function generateWorkingSetTargets(
  setsCount: number,
  topWeight: number,
  topReps: number,
  prevWorkingSets: TrainingSet[],
  repsDelta: number,
  startSetNumber: number,
): SetTarget[] {
  const sorted = [...prevWorkingSets]
    .sort((a, b) => a.set_number - b.set_number)
    .slice(0, setsCount)

  if (sorted.length === setsCount) {
    return sorted.map((s, i) => ({
      set_number: startSetNumber + i,
      weight_kg: s.weight_kg,
      reps: Math.max(1, s.reps + repsDelta),
      is_warmup: false,
    }))
  }

  return Array.from({ length: setsCount }, (_, i) => ({
    set_number: startSetNumber + i,
    weight_kg: topWeight,
    reps: Math.max(1, topReps - i),
    is_warmup: false,
  }))
}

/** ウォームアップセットは前回の重量・回数を維持（進捗不要）*/
function buildWarmupTargets(warmupSets: TrainingSet[]): SetTarget[] {
  return [...warmupSets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((s, i) => ({
      set_number: i + 1,
      weight_kg: s.weight_kg,
      reps: s.reps,
      is_warmup: true,
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
    const setTargets: SetTarget[] = Array.from({ length: sets }, (_, i) => ({
      set_number: i + 1,
      weight_kg: 0,
      reps: Math.max(1, reps - i),
      is_warmup: false,
    }))
    return { weight: 0, sets, reps, reason: '初回のため初期値を使用', setTargets }
  }

  // ── ウォームアップとワーキングセットを分離 ────────────────
  const prevWarmupSets = lastSets.filter(s => s.is_warmup)
  const workingSets = lastSets.filter(s => !s.is_warmup)
  const effectiveSets = workingSets.length > 0 ? workingSets : lastSets

  const warmupTargets = buildWarmupTargets(prevWarmupSets)
  const warmupCount = warmupTargets.length
  const workingStart = warmupCount + 1  // ワーキングセットの開始番号

  const lastWeight = Math.max(...effectiveSets.map(s => s.weight_kg))
  const lastSetsCount = effectiveSets.length

  const topSets = effectiveSets.filter(s => s.weight_kg === lastWeight)
  const allTopSetsHadRoom = topSets.every(s => s.rir === true)
  const bestTopReps = Math.max(...topSets.map(s => s.reps))
  const reachedTarget = bestTopReps >= exercise.default_reps

  const combine = (workingTargets: SetTarget[]): SetTarget[] =>
    [...warmupTargets, ...workingTargets]

  // ── 疲労度が高い → 回復セッション ─────────────────────────
  if (lastFatigue && lastFatigue >= 4) {
    if (lastWeight === 0) {
      const reps = Math.max(1, Math.round(bestTopReps * 0.8))
      const working = generateWorkingSetTargets(lastSetsCount, 0, reps, [], 0, workingStart)
      return {
        weight: 0, sets: warmupCount + lastSetsCount, reps,
        reason: '前回の疲労度が高いため回数を20%減',
        setTargets: combine(working),
      }
    }
    const weight = Math.round((lastWeight * 0.95) / 2.5) * 2.5
    const working = generateWorkingSetTargets(lastSetsCount, weight, bestTopReps, [], 0, workingStart)
    return {
      weight, sets: warmupCount + lastSetsCount, reps: bestTopReps,
      reason: '前回の疲労度が高いため重量を5%減',
      setTargets: combine(working),
    }
  }

  // ── レップ未達 ─────────────────────────────────────────────
  if (!reachedTarget) {
    const nextReps = Math.min(bestTopReps + 1, exercise.default_reps)
    const working = generateWorkingSetTargets(lastSetsCount, lastWeight, nextReps, effectiveSets, +1, workingStart)
    return {
      weight: lastWeight, sets: warmupCount + lastSetsCount, reps: nextReps,
      reason: `前回${bestTopReps}回のため重量維持・目標${nextReps}回`,
      setTargets: combine(working),
    }
  }

  // ── 全トップセット余裕あり → 負荷UP ──────────────────────
  if (allTopSetsHadRoom) {
    if (lastWeight === 0) {
      const reps = bestTopReps + 2
      const working = generateWorkingSetTargets(lastSetsCount, 0, reps, effectiveSets, +2, workingStart)
      return {
        weight: 0, sets: warmupCount + lastSetsCount, reps,
        reason: `前回${bestTopReps}回余裕ありのため目標回数+2`,
        setTargets: combine(working),
      }
    }
    const weight = lastWeight + 2.5
    const reps = exercise.default_reps
    const working = generateWorkingSetTargets(lastSetsCount, weight, reps, [], 0, workingStart)
    return {
      weight, sets: warmupCount + lastSetsCount, reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
      setTargets: combine(working),
    }
  }

  // ── ストール → セット数+1 ─────────────────────────────────
  if (isStagnant) {
    const newWorkingCount = lastSetsCount + 1
    const baseWorking = generateWorkingSetTargets(lastSetsCount, lastWeight, bestTopReps, effectiveSets, 0, workingStart)
    const lastTarget = baseWorking[baseWorking.length - 1]
    const extraSet: SetTarget = {
      set_number: workingStart + lastSetsCount,
      weight_kg: lastTarget.weight_kg,
      reps: Math.max(1, lastTarget.reps - 1),
      is_warmup: false,
    }
    return {
      weight: lastWeight, sets: warmupCount + newWorkingCount, reps: bestTopReps,
      reason: '3週間停滞のためセット数+1',
      setTargets: combine([...baseWorking, extraSet]),
    }
  }

  // ── ギリギリ達成 → 前回実績をそのまま目標に ───────────────
  const working = generateWorkingSetTargets(lastSetsCount, lastWeight, bestTopReps, effectiveSets, 0, workingStart)
  return {
    weight: lastWeight, sets: warmupCount + lastSetsCount, reps: bestTopReps,
    reason: '前回ギリギリのため重量・レップ維持',
    setTargets: combine(working),
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
    const ws = s.sets.filter(set => set.exercise_id === exerciseId && !set.is_warmup)
    return ws.length > 0 ? Math.max(...ws.map(set => set.weight_kg)) : 0
  })
  return weights.every(w => w === weights[0])
}

function getVolumeStatus(weeklySets: number): VolumeStatus {
  if (weeklySets < 10) return 'low'
  if (weeklySets <= 20) return 'optimal'
  return 'high'
}
