import type {
  ProgramSlot,
  ProgramWeeklyParams,
  UserSlotAssignment,
  UserExercise,
  UserSlotOneRm,
  SetSuggestion,
  SlotSuggestion,
  ProgramSuggestion,
  ProgramPhase,
  UserProgramEnrollment,
  TrainingSet,
} from '@/types'

export type ProgramEngineInput = {
  enrollment: UserProgramEnrollment
  day_number: 1 | 2 | 3 | 4
  slots: ProgramSlot[]
  weekly_params: ProgramWeeklyParams[]
  assignments: UserSlotAssignment[]
  exercises: UserExercise[]
  one_rms: UserSlotOneRm[]
  recent_sets_by_exercise: Record<string, TrainingSet[]>
}

const DAY_LABELS: Record<number, string> = {
  1: 'Day 1',
  2: 'Day 2',
  3: 'Day 3',
  4: 'Day 4',
}

function roundWeight(w: number): number {
  return Math.round(w / 2.5) * 2.5
}

function buildWarmupSets(oneRm: number): SetSuggestion[] {
  return [
    { set_type: 'warmup', suggested_weight_kg: roundWeight(oneRm * 0.4), target_reps: 5, target_rpe: 5 },
    { set_type: 'warmup', suggested_weight_kg: roundWeight(oneRm * 0.6), target_reps: 3, target_rpe: 6 },
    { set_type: 'warmup', suggested_weight_kg: roundWeight(oneRm * 0.8), target_reps: 1, target_rpe: 7 },
  ]
}

function buildCompoundSets(params: ProgramWeeklyParams, oneRm: number): SetSuggestion[] {
  const sets: SetSuggestion[] = []

  if (params.top_set_pct_rm != null && (params.top_set_reps != null || params.top_set_is_amrap)) {
    sets.push({
      set_type: 'top',
      suggested_weight_kg: roundWeight(oneRm * params.top_set_pct_rm),
      target_reps: params.top_set_is_amrap ? 'amrap' : params.top_set_reps!,
      target_rpe: params.top_set_rpe ?? 9,
    })
  }

  if (params.backoff_sets && params.backoff_pct_rm && params.backoff_reps) {
    const backoffWeight = roundWeight(oneRm * params.backoff_pct_rm)
    for (let i = 0; i < params.backoff_sets; i++) {
      sets.push({
        set_type: 'backoff',
        suggested_weight_kg: backoffWeight,
        target_reps: params.backoff_reps,
        target_rpe: 8,
      })
    }
  }

  return sets
}

function suggestIsolationWeight(params: ProgramWeeklyParams, recentSets: TrainingSet[]): number {
  const workingSets = recentSets.filter(s => !s.is_warmup)
  if (workingSets.length === 0) return 0

  const maxWeight = Math.max(...workingSets.map(s => s.weight_kg))
  const minReps = params.rep_range_min ?? 0
  const maxReps = params.rep_range_max ?? 9999

  const allAboveMax = workingSets.every(s => s.reps > maxReps)
  const anyBelowMin = workingSets.some(s => s.reps < minReps)

  if (allAboveMax) return maxWeight + 2.5
  if (anyBelowMin) return Math.max(0, maxWeight - 2.5)
  return maxWeight
}

function buildIsolationSets(params: ProgramWeeklyParams, recentSets: TrainingSet[]): SetSuggestion[] {
  if (!params.working_sets) return []
  const suggestedWeight = suggestIsolationWeight(params, recentSets)
  return Array.from({ length: params.working_sets }, () => ({
    set_type: 'working' as const,
    suggested_weight_kg: suggestedWeight,
    target_reps: params.rep_range_min ?? 10,
    rep_range_min: params.rep_range_min ?? undefined,
    rep_range_max: params.rep_range_max ?? undefined,
    target_rpe: params.rpe ?? 8,
  }))
}

function slotNotes(params: ProgramWeeklyParams): string | undefined {
  if (params.phase === 'deload') return 'ディロード週 — 重量を抑えて回復に集中'
  if (params.phase === 'maxout' && params.top_set_is_amrap) return 'MaxOut週 — 全力で限界まで挑戦！'
  if (params.top_set_is_amrap) return '全力セット: できる限り多くの回数に挑戦！'
  return undefined
}

export function buildProgramSuggestion(input: ProgramEngineInput): ProgramSuggestion {
  const {
    enrollment,
    day_number,
    slots,
    weekly_params,
    assignments,
    exercises,
    one_rms,
    recent_sets_by_exercise,
  } = input

  const maxPriority =
    enrollment.session_duration_minutes === 60 ? 1
    : enrollment.session_duration_minutes === 75 ? 2
    : 3

  const daySlots = slots
    .filter(s => s.day_number === day_number && s.priority <= maxPriority)
    .sort((a, b) => a.sort_order - b.sort_order)

  const paramsMap = new Map(weekly_params.map(p => [p.slot_id, p]))
  const assignmentMap = new Map(assignments.map(a => [a.slot_id, a]))
  const exerciseMap = new Map(exercises.map(e => [e.id, e]))
  const oneRmMap = new Map(one_rms.map(r => [r.slot_id, r]))

  const phase: ProgramPhase = (() => {
    const w = enrollment.current_week
    if (w <= 4) return 'volume'
    if (w <= 7) return 'intensity'
    if (w === 8) return 'deload'
    return 'maxout'
  })()

  const slotSuggestions: SlotSuggestion[] = []

  for (const slot of daySlots) {
    const params = paramsMap.get(slot.slot_id)
    if (!params || params.is_excluded) continue

    const assignment = assignmentMap.get(slot.slot_id)
    if (!assignment) continue

    const exercise = exerciseMap.get(assignment.exercise_id)
    if (!exercise) continue

    let sets: SetSuggestion[]

    if (slot.has_one_rm) {
      const oneRmRecord = oneRmMap.get(slot.slot_id)
      if (!oneRmRecord) continue
      sets = buildCompoundSets(params, oneRmRecord.one_rm_kg)
    } else {
      const recentSets = recent_sets_by_exercise[exercise.id] ?? []
      sets = buildIsolationSets(params, recentSets)
    }

    if (sets.length === 0) continue

    slotSuggestions.push({
      slot_id: slot.slot_id,
      slot,
      exercise,
      sets,
      notes: slotNotes(params),
    })
  }

  return {
    week_number: enrollment.current_week,
    phase,
    day_number,
    day_label: DAY_LABELS[day_number] ?? `Day ${day_number}`,
    slots: slotSuggestions,
  }
}
