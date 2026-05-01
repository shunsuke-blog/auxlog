import type { UserExercise, TrainingSet, SessionWithSets, Suggestion, VolumeStatus } from '@/types'

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

      const { weight, sets, reps, reason } = proposeNextSet(
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
        reason,
        days_since_last: daysSinceLast,
        weekly_volume_sets: weeklyVolumeSets,
        volume_status: getVolumeStatus(weeklyVolumeSets),
      }
    })
    .sort((a, b) => b.days_since_last - a.days_since_last)
}

function proposeNextSet(
  lastSets: TrainingSet[],
  exercise: UserExercise,
  lastFatigue?: number,
  isStagnant?: boolean
): { weight: number; sets: number; reps: number; reason: string } {
  if (lastSets.length === 0) {
    return {
      weight: 0,
      sets: exercise.default_sets,
      reps: exercise.default_reps,
      reason: '初回のため初期値を使用',
    }
  }

  const allSetsHadRoom = lastSets.every(s => s.rir === true)
  const allSetsHitReps = lastSets.every(s => s.reps >= exercise.default_reps)
  const lastWeight = lastSets[0].weight_kg
  const lastSetsCount = lastSets.length

  if (lastFatigue && lastFatigue >= 4) {
    return {
      weight: Math.round((lastWeight * 0.95) / 2.5) * 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回の疲労度が高いため重量を5%減',
    }
  }

  if (isStagnant) {
    return {
      weight: lastWeight,
      sets: lastSetsCount + 1,
      reps: exercise.default_reps,
      reason: '3週間停滞のためセット数+1',
    }
  }

  if (allSetsHadRoom && allSetsHitReps) {
    return {
      weight: lastWeight + 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
    }
  }

  if (!allSetsHitReps) {
    return {
      weight: lastWeight,
      sets: lastSetsCount,
      reps: Math.max(1, exercise.default_reps - 1),
      reason: '前回レップ未達のため重量維持・目標レップ-1',
    }
  }

  return {
    weight: lastWeight,
    sets: lastSetsCount,
    reps: exercise.default_reps,
    reason: '前回ギリギリのため重量・レップ維持',
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
    .filter(set => set.exercise_id === exercise.id)
    .length
}

function checkStagnation(exerciseId: string, sessions: SessionWithSets[]): boolean {
  const exerciseSessions = sessions
    .filter(s => s.sets.some(set => set.exercise_id === exerciseId))
    .slice(0, 3)

  if (exerciseSessions.length < 3) return false

  const weights = exerciseSessions.map(s =>
    s.sets.find(set => set.exercise_id === exerciseId)?.weight_kg ?? 0
  )

  return weights.every(w => w === weights[0])
}

function getVolumeStatus(weeklySets: number): VolumeStatus {
  if (weeklySets < 10) return 'low'
  if (weeklySets <= 20) return 'optimal'
  return 'high'
}
