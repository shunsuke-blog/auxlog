import type { UserExercise, TrainingSet, SessionWithSets, Suggestion, SetTarget, VolumeStatus } from '@/types'
import { TRAINING } from '@/lib/constants/training'

type SuggestInput = {
  exercises: UserExercise[]
  recentSessions: SessionWithSets[]
  todayDate: Date
}

// ────────────────────────────────────────────────────────────────
// ヘルパー関数群
// ────────────────────────────────────────────────────────────────

/** 疲労度が高い（回復優先セッションが必要）か判定 */
function isHighFatigue(fatigue?: number): boolean {
  return fatigue !== undefined && fatigue >= 4
}

/** ウォームアップとワーキングセットを分離 */
function separateSets(sets: TrainingSet[]): {
  warmup: TrainingSet[]
  working: TrainingSet[]
} {
  return {
    warmup: sets.filter(s => s.is_warmup),
    working: sets.filter(s => !s.is_warmup),
  }
}

/** トップセット（最大重量のセット）とそのメトリクスを算出 */
function getTopSetMetrics(workingSets: TrainingSet[]): {
  topWeight: number
  topSets: TrainingSet[]
  bestTopReps: number
  allTopSetsHadRoom: boolean
} {
  const topWeight = Math.max(...workingSets.map(s => s.weight_kg))
  const topSets = workingSets.filter(s => s.weight_kg === topWeight)
  const bestTopReps = Math.max(...topSets.map(s => s.reps))
  const allTopSetsHadRoom = topSets.every(s => s.rir === true)
  return { topWeight, topSets, bestTopReps, allTopSetsHadRoom }
}

/**
 * ワーキングセットの目標を生成する
 * - heavySets（80%以上）が setsCount と一致する場合: 前回の重量パターンを引き継ぎ repsDelta 分回数調整
 * - 不一致の場合: topWeight の直線セット + 疲労モデル（1セットごとに1回減少）
 */
function generateWorkingSetTargets(
  setsCount: number,
  topWeight: number,
  topReps: number,
  prevWorkingSets: TrainingSet[],
  repsDelta: number,
  startSetNumber: number,
): SetTarget[] {
  const heavySets = [...prevWorkingSets]
    .filter(s => !s.is_warmup && (topWeight === 0 || s.weight_kg >= topWeight * TRAINING.WARMUP_WEIGHT_RATIO))
    .sort((a, b) => a.set_number - b.set_number)
    .slice(0, setsCount)

  if (heavySets.length === setsCount) {
    return heavySets.map((s, i) => ({
      set_number: startSetNumber + i,
      weight_kg: s.weight_kg,
      reps: Math.max(1, s.reps + repsDelta),
      is_warmup: false,
    }))
  }

  // 疲労モデル: 1セットごとに1回減少
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

// ────────────────────────────────────────────────────────────────
// メイン提案ロジック
// ────────────────────────────────────────────────────────────────

export function suggestMenu(input: SuggestInput): Suggestion[] {
  const { exercises, recentSessions, todayDate } = input

  return exercises
    .filter(e => e.is_active)
    .flatMap(exercise => {
      const lastSession = getLastSessionForExercise(exercise.id, recentSessions)
      const daysSinceLast = lastSession
        ? diffDays(todayDate, new Date(lastSession.trained_at))
        : TRAINING.DAYS_SINCE_LAST_NEVER

      const lastSets = lastSession?.sets.filter(s => s.exercise_id === exercise.id) ?? []
      const lastWorkingSets = lastSets.filter(s => !s.is_warmup)

      // 種目・前回結果に応じた回復日数で除外
      const minRecoveryDays = calcMinRecoveryDays(exercise, lastWorkingSets)
      if (daysSinceLast < minRecoveryDays) return []

      const weeklyVolumeSets = calcWeeklyVolumeSets(exercise, recentSessions, todayDate)
      const isStagnant = checkStagnation(exercise.id, recentSessions)

      const { weight, sets, reps, reason, setTargets } = proposeNextSet(
        lastSets, exercise, lastSession?.fatigue_level, isStagnant
      )

      return [{
        exercise,
        proposed_weight_kg: weight,
        proposed_sets: sets,
        proposed_reps: reps,
        proposed_set_targets: setTargets,
        reason,
        days_since_last: daysSinceLast,
        weekly_volume_sets: weeklyVolumeSets,
        volume_status: getVolumeStatus(weeklyVolumeSets),
      }]
    })
    .sort((a, b) => b.days_since_last - a.days_since_last)
}

function proposeNextSet(
  lastSets: TrainingSet[],
  exercise: UserExercise,
  lastFatigue?: number,
  isStagnant?: boolean
): { weight: number; sets: number; reps: number; reason: string; setTargets: SetTarget[] } {
  // ── 初回 ──────────────────────────────────────────────────────
  if (lastSets.length === 0) {
    const reps = exercise.default_reps
    const sets = exercise.default_sets
    const setTargets: SetTarget[] = Array.from({ length: sets }, (_, i) => ({
      set_number: i + 1, weight_kg: 0, reps: Math.max(1, reps - i), is_warmup: false,
    }))
    return { weight: 0, sets, reps, reason: '初回のため初期値を使用', setTargets }
  }

  // ── ウォームアップ/ワーキング分離 ────────────────────────────
  const { warmup: prevWarmupSets, working: workingSets } = separateSets(lastSets)
  const effectiveSets = workingSets.length > 0 ? workingSets : lastSets
  const { topWeight, bestTopReps, allTopSetsHadRoom } = getTopSetMetrics(effectiveSets)
  const lastSetsCount = effectiveSets.length
  const reachedTarget = bestTopReps >= exercise.default_reps

  const warmupTargets = buildWarmupTargets(prevWarmupSets)
  const warmupCount = warmupTargets.length
  const workingStart = warmupCount + 1
  const combine = (w: SetTarget[]) => [...warmupTargets, ...w]

  // ── 疲労度高 → 回復セッション ────────────────────────────────
  if (isHighFatigue(lastFatigue)) {
    if (lastWeight(effectiveSets) === 0) {
      const reps = Math.max(1, Math.round(bestTopReps * TRAINING.FATIGUE_REPS_REDUCTION))
      return {
        weight: 0, sets: warmupCount + lastSetsCount, reps,
        reason: '前回の疲労度が高いため回数を20%減',
        setTargets: combine(generateWorkingSetTargets(lastSetsCount, 0, reps, [], 0, workingStart)),
      }
    }
    const weight = Math.round((topWeight * TRAINING.FATIGUE_WEIGHT_REDUCTION) / 2.5) * 2.5
    return {
      weight, sets: warmupCount + lastSetsCount, reps: bestTopReps,
      reason: '前回の疲労度が高いため重量を5%減',
      setTargets: combine(generateWorkingSetTargets(lastSetsCount, weight, bestTopReps, [], 0, workingStart)),
    }
  }

  // ── レップ未達 → 前回+1回を目標 ─────────────────────────────
  if (!reachedTarget) {
    const nextReps = Math.min(bestTopReps + 1, exercise.default_reps)
    return {
      weight: topWeight, sets: warmupCount + lastSetsCount, reps: nextReps,
      reason: `前回${bestTopReps}回のため重量維持・目標${nextReps}回`,
      setTargets: combine(generateWorkingSetTargets(lastSetsCount, topWeight, nextReps, effectiveSets, +1, workingStart)),
    }
  }

  // ── 全余裕あり → 負荷UP ──────────────────────────────────────
  if (allTopSetsHadRoom) {
    if (topWeight === 0) {
      const reps = bestTopReps + TRAINING.BODYWEIGHT_REPS_INCREMENT
      return {
        weight: 0, sets: warmupCount + lastSetsCount, reps,
        reason: `前回${bestTopReps}回余裕ありのため目標回数+2`,
        setTargets: combine(generateWorkingSetTargets(lastSetsCount, 0, reps, effectiveSets, +2, workingStart)),
      }
    }
    const weight = topWeight + TRAINING.WEIGHT_INCREMENT_KG
    const reps = exercise.default_reps
    return {
      weight, sets: warmupCount + lastSetsCount, reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
      setTargets: combine(generateWorkingSetTargets(lastSetsCount, weight, reps, [], 0, workingStart)),
    }
  }

  // ── ストール → セット数+1 ─────────────────────────────────────
  if (isStagnant) {
    const newWorkingCount = lastSetsCount + 1
    const baseTargets = generateWorkingSetTargets(lastSetsCount, topWeight, bestTopReps, effectiveSets, 0, workingStart)
    const lastT = baseTargets[baseTargets.length - 1]
    const extra: SetTarget = {
      set_number: workingStart + lastSetsCount,
      weight_kg: lastT.weight_kg,
      reps: Math.max(1, lastT.reps - 1),
      is_warmup: false,
    }
    return {
      weight: topWeight, sets: warmupCount + newWorkingCount, reps: bestTopReps,
      reason: '3週間停滞のためセット数+1',
      setTargets: combine([...baseTargets, extra]),
    }
  }

  // ── ギリギリ達成 → 前回実績を維持 ───────────────────────────
  return {
    weight: topWeight, sets: warmupCount + lastSetsCount, reps: bestTopReps,
    reason: '前回ギリギリのため重量・レップ維持',
    setTargets: combine(generateWorkingSetTargets(lastSetsCount, topWeight, bestTopReps, effectiveSets, 0, workingStart)),
  }
}

/** 最大重量を取得（effectiveSets から） */
function lastWeight(sets: TrainingSet[]): number {
  return Math.max(...sets.map(s => s.weight_kg))
}

// ────────────────────────────────────────────────────────────────
// ユーティリティ関数
// ────────────────────────────────────────────────────────────────

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
    .slice(0, TRAINING.STAGNATION_SESSION_COUNT)

  if (exerciseSessions.length < 3) return false

  const weights = exerciseSessions.map(s => {
    const ws = s.sets.filter(set => set.exercise_id === exerciseId && !set.is_warmup)
    return ws.length > 0 ? Math.max(...ws.map(set => set.weight_kg)) : 0
  })

  return weights.every(w => w === weights[0])
}

/**
 * 前回のセット内容と種目タイプから必要な回復日数を算出
 * - コンパウンド + 限界 → 3日
 * - アイソレーション + 限界 → 2日
 * - 全セット余裕あり → 2日
 * - それ以外（混在） → 2日（デフォルト）
 */
function calcMinRecoveryDays(exercise: import('@/types').UserExercise, lastWorkingSets: TrainingSet[]): number {
  if (lastWorkingSets.length === 0) return TRAINING.MIN_DAYS_BETWEEN_SESSIONS

  const anyFailure = lastWorkingSets.some(s => s.rir === false)
  const allHadRoom = lastWorkingSets.every(s => s.rir === true)

  if (anyFailure) {
    return exercise.is_compound
      ? TRAINING.RECOVERY_DAYS_COMPOUND_FAILURE
      : TRAINING.RECOVERY_DAYS_ISOLATION_FAILURE
  }
  if (allHadRoom) return TRAINING.RECOVERY_DAYS_ALL_ROOM
  return TRAINING.MIN_DAYS_BETWEEN_SESSIONS
}

function getVolumeStatus(weeklySets: number): VolumeStatus {
  if (weeklySets < TRAINING.WEEKLY_VOLUME_LOW) return 'low'
  if (weeklySets <= TRAINING.WEEKLY_VOLUME_HIGH) return 'optimal'
  return 'high'
}
