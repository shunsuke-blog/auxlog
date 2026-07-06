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
  TargetMuscle,
} from '@/types'
import { INTENSITY_TECHNIQUE_LABELS } from '@/types'
import {
  PROGRAM_SLOTS,
  slotHasOneRm,
  sessionDurationToTier,
  isPriorityMuscleForUser,
  findSupersetPartnerSlotId,
  type FrequencyVariant,
} from '@/lib/constants/program_slots'
import { generateDaySlotIds } from '@/lib/suggest/generate_program_slots'

const SLOT_DEF_MAP = new Map(PROGRAM_SLOTS.map(s => [s.slot_id, s]))

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

// 1RM管理種目（重いコンパウンド）はボリューム期でもRIR1〜2で止める（RPE換算で9.0が上限）。
// 重いフリーウェイトを限界まで潰すのは怪我・過剰疲労のリスクが高く、筋力の伸びは
// 限界接近度に依存しにくいため、エフォート最大化はアイソレーションに限定する
// （実装依頼書 2026-07-06、受け入れ条件(a)）。
const COMPOUND_VOLUME_PHASE_RPE_CEILING = 9.0

function buildCompoundSets(params: ProgramWeeklyParams, oneRm: number): SetSuggestion[] {
  const sets: SetSuggestion[] = []

  if (params.top_set_pct_rm != null && (params.top_set_reps != null || params.top_set_is_amrap)) {
    const rawRpe = params.top_set_rpe ?? 9
    const targetRpe = params.phase === 'volume'
      ? Math.min(rawRpe, COMPOUND_VOLUME_PHASE_RPE_CEILING)
      : rawRpe

    sets.push({
      set_type: 'top',
      suggested_weight_kg: roundWeight(oneRm * params.top_set_pct_rm),
      target_reps: params.top_set_is_amrap ? 'amrap' : params.top_set_reps!,
      target_rpe: targetRpe,
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

function buildIsolationSets(
  params: ProgramWeeklyParams,
  recentSets: TrainingSet[],
  overrides?: { workingSets?: number | null; targetRpe?: number },
): SetSuggestion[] {
  const workingSets = overrides?.workingSets ?? params.working_sets
  if (!workingSets) return []
  const suggestedWeight = suggestIsolationWeight(params, recentSets)
  return Array.from({ length: workingSets }, () => ({
    set_type: 'working' as const,
    suggested_weight_kg: suggestedWeight,
    target_reps: params.rep_range_min ?? 10,
    rep_range_min: params.rep_range_min ?? undefined,
    rep_range_max: params.rep_range_max ?? undefined,
    target_rpe: overrides?.targetRpe ?? params.rpe ?? 8,
  }))
}

// ── tier別漸進レバー ──
// 60分tier、または60〜90/90分tierの非優先部位は、ボリューム漸進が発動しない
// （このスロットの「漸進のレバー」は量ではなくエフォートになる）。
// 根拠: 低ボリューム時ほどエフォート（RIR）が代償として重要になり、限界手前(RIR1)は
// 完全限界(RIR0)とほぼ同等の肥大が得られる。ボリューム漸進は筋肉ごとに行うのが本来の
// 使い方であり、全身一律ではない（実装依頼書 2026-07-06）。
// 優先部位はユーザーがオンボーディング/設定で選択する（enrollment.priority_muscles）。
// 未選択（空配列）ならisPriorityMuscleForUserがコード定数のデフォルト（胸）にフォールバックする。
function volumeRampsThisTier(
  muscleGroup: TargetMuscle,
  maxTier: 1 | 2 | 3,
  userPriorityMuscles: readonly TargetMuscle[] | null | undefined,
): boolean {
  return maxTier >= 2 && isPriorityMuscleForUser(muscleGroup, userPriorityMuscles)
}

// RIRをRPE(=10-RIR)に変換して返す。ボリューム期は週1のRIR2.5→週4のRIR0.5へ線形に漸進、
// 強度期はボリューム期末より緩めたRIR1.5で維持（セット数が増えない分、追い込み過ぎを防ぐ）、
// 回復週(deload/maxout)はRIR3まで緩める。
function effortRampTargetRpe(weekNumber: number, phase: ProgramPhase): number {
  if (phase === 'volume') {
    const rir = 2.5 - (Math.min(weekNumber, 4) - 1) * ((2.5 - 0.5) / 3)
    return Math.round((10 - rir) * 2) / 2
  }
  if (phase === 'intensity') return 8.5
  return 7.0
}

// ボリュームが漸進しないスロットの固定セット数 = 週1のDB値（=このメソサイクルの
// 出発点の量）。9週分のweekly_paramsが渡されている前提（現在週だけの抽出ではない）。
function fixedWorkingSetsBaseline(slotId: string, allWeeklyParams: ProgramWeeklyParams[]): number | null {
  const week1 = allWeeklyParams.find(p => p.slot_id === slotId && p.week_number === 1)
  return week1?.working_sets ?? null
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

  const maxTier = sessionDurationToTier((enrollment.session_duration_minutes ?? 90) as 60 | 75 | 90)
  const freq = enrollment.days_per_week as FrequencyVariant

  // 日別の配置は lib/suggest/generate_program_slots.ts（部位×動きパターンベースの動的生成）
  // を正とする。DB program_slots の day_number/priority は4日版の初期値としてのみ使い、
  // ここでは参照しない。
  const daySlotIds = generateDaySlotIds(freq, maxTier).get(day_number) ?? new Set<string>()
  const daySlots = slots
    .filter(s => daySlotIds.has(s.slot_id))
    .sort((a, b) => a.sort_order - b.sort_order)

  // weekly_paramsは9週分まとめて渡される前提（fixedWorkingSetsBaselineが週1を参照するため）。
  // 現在週の行だけをスロットごとの参照用マップにする。
  const currentWeekParams = weekly_params.filter(p => p.week_number === enrollment.current_week)
  const paramsMap = new Map(currentWeekParams.map(p => [p.slot_id, p]))
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

    const slotDef = SLOT_DEF_MAP.get(slot.slot_id)
    const hasOneRm = slotDef ? slotHasOneRm(slotDef, freq) : slot.has_one_rm

    if (hasOneRm) {
      const oneRmRecord = oneRmMap.get(slot.slot_id)
      if (oneRmRecord) {
        sets = buildCompoundSets(params, oneRmRecord.one_rm_kg)
      } else {
        // 1RM未設定: 直近の記録重量を使用、なければ weight=0 で表示
        const recentWorkingSets = (recent_sets_by_exercise[exercise.id] ?? []).filter(s => !s.is_warmup)
        const lastWeight = recentWorkingSets.length > 0
          ? Math.max(...recentWorkingSets.map(s => s.weight_kg))
          : 0
        const count = (params.top_set_pct_rm != null ? 1 : 0) + (params.backoff_sets ?? 0) || 3
        sets = Array.from({ length: count }, () => ({
          set_type: 'working' as const,
          suggested_weight_kg: lastWeight,
          target_reps: params.backoff_reps ?? params.rep_range_min ?? 5,
          target_rpe: 8,
        }))
      }
    } else {
      const recentSets = recent_sets_by_exercise[exercise.id] ?? []
      const muscleGroup = slotDef?.muscle_group ?? (slot.muscle_group as TargetMuscle)

      if (volumeRampsThisTier(muscleGroup, maxTier, enrollment.priority_muscles)) {
        // 優先部位 かつ tier2/3: 既存どおりDBの週次working_sets/rpeをそのまま使う
        // （ここがボリューム漸進のターゲット方式）
        sets = buildIsolationSets(params, recentSets)
      } else {
        // 非優先部位、または tier1(60分): セット数を週1の値に固定し、RIRをフェーズで漸進させる
        const fixedSets = fixedWorkingSetsBaseline(slot.slot_id, weekly_params) ?? params.working_sets
        sets = buildIsolationSets(params, recentSets, {
          workingSets: fixedSets,
          targetRpe: effortRampTargetRpe(enrollment.current_week, phase),
        })
      }
    }

    if (sets.length === 0) continue

    const noteFragments: string[] = []
    const phaseNote = slotNotes(params)
    if (phaseNote) noteFragments.push(phaseNote)

    // ~60tier: アイソレーション最終セットに強度テクニックを許可
    if (maxTier === 1 && !hasOneRm && exercise.intensity_technique !== 'none') {
      const label = INTENSITY_TECHNIQUE_LABELS[exercise.intensity_technique]
      noteFragments.push(`最終セットは${label}で追い込みOK`)
    }

    // 拮抗筋スーパーセット: 時間が逼迫するtier(60〜90分)でのみ提示
    if (maxTier === 2) {
      const partnerId = findSupersetPartnerSlotId(slot.slot_id, daySlotIds)
      const partnerExerciseName = partnerId
        ? exerciseMap.get(assignmentMap.get(partnerId)?.exercise_id ?? '')?.name
        : undefined
      if (partnerExerciseName) {
        noteFragments.push(`「${partnerExerciseName}」とスーパーセットで時短も可能`)
      }
    }

    slotSuggestions.push({
      slot_id: slot.slot_id,
      slot,
      exercise,
      sets,
      notes: noteFragments.length > 0 ? noteFragments.join(' ／ ') : undefined,
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
