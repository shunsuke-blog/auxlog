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
import { INTENSITY_TECHNIQUE_LABELS } from '@/types'
import { estimateOneRm } from '@/lib/utils/epley'
import type { PriorityMuscleOption, CompositionCategory } from '@/lib/constants/program_composition'
import {
  buildExerciseCategories,
  distributeToDays,
  isOneRmDemotedAtDays,
  findSupersetPartnerCategory,
  setsForNonPatternCategory,
  type DaysPerWeek,
  type SessionDurationMinutes,
} from '@/lib/suggest/generate_program_composition'

/**
 * enrollment.priority_musclesはまだTargetMuscle[]型（二頭・三頭を区別できない）のため、
 * 'arms'はどちらにもマッピングできず現時点では優先部位として扱えない
 * （brainstorm #10「二頭・三頭を別選択肢にする」実装待ち、未着手）。
 * chest/back/shoulders/legs/coreはTargetMuscleとPriorityMuscleOptionの文字列が一致するため
 * そのまま通す。
 */
function toPriorityMuscleOptions(targetMuscles: readonly string[] | null | undefined): PriorityMuscleOption[] {
  const valid = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'])
  return (targetMuscles ?? []).filter((m): m is PriorityMuscleOption => valid.has(m))
}

/** そのカテゴリの部位がpriority選択に含まれるか（腕はbiceps/tricepsどちらかで判定）。 */
function categoryMuscleIsPriority(category: CompositionCategory, priorities: readonly PriorityMuscleOption[]): boolean {
  if (category.muscle === 'arms') return priorities.includes('biceps') || priorities.includes('triceps')
  return priorities.includes(category.muscle as PriorityMuscleOption)
}

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

// 6パターン以外の1RM管理カテゴリ（例: leg_2）は、%RMという重量計算方法だけ既存の
// buildCompoundSetsと共有しつつ、セット数は週次固定値ではなくbrainstorm #8の
// 「セット数=f(セッション時間)」に従わせる。backoff_setsの数を無視し、
// targetCountちょうどになるまでtop set→backoff setの順に詰める
// （2026-07-08、実機確認フィードバック対応。isSixPatternのみ旧来のbuildCompoundSetsのまま）。
function buildCompoundSetsForCount(params: ProgramWeeklyParams, oneRm: number, targetCount: number): SetSuggestion[] {
  const sets: SetSuggestion[] = []

  if (params.top_set_pct_rm != null && (params.top_set_reps != null || params.top_set_is_amrap) && targetCount > 0) {
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

  const remaining = targetCount - sets.length
  if (remaining > 0 && params.backoff_pct_rm && params.backoff_reps) {
    const backoffWeight = roundWeight(oneRm * params.backoff_pct_rm)
    for (let i = 0; i < remaining; i++) {
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

// back_row/back_pull/leg_hingeのようなカテゴリはカテゴリ既定がhasOneRm:falseのため、
// weekly_paramsがアイソレーション用フィールド(working_sets/rep_range/rpe)だけで作られ、
// top_set_pct_rm等の%RM系フィールドを持たない。ここに1RM管理される種目（例:
// デッドリフト）が種目単位の判定で割り当てられると、buildCompoundSets系が空配列を
// 返しスロットごと非表示になってしまうため、アイソレーション側のデータから
// メイン/追い込み構成を合成するフォールバック。%RMはこのカテゴリ専用のチューニング値が
// ないため、他の1RM管理カテゴリ(chest_press/shoulder_press/leg_squat)の週1実績値
// （top:0.75〜0.8、backoff:0.73〜0.76）を参考にした暫定値を使う。oneRm=0（1RM未入力）
// ならroundWeight(0*pct)=0のままなので、前ターンの「重量はブランクでいい」方針も両立する
// （2026-07-08、実機確認フィードバック対応。当初は重量を一律0にしていたが、実際に1RMが
// 入力されているのに反映されないバグだったため修正）。
const ISOLATION_FALLBACK_TOP_SET_PCT_RM = 0.8
const ISOLATION_FALLBACK_BACKOFF_PCT_RM = 0.75

function buildCompoundSetsFromIsolationParams(params: ProgramWeeklyParams, oneRm: number, targetCount: number): SetSuggestion[] {
  const totalSets = targetCount > 0 ? targetCount : (params.working_sets ?? 3)
  if (totalSets <= 0) return []

  const reps = params.rep_range_min ?? 5
  const rawRpe = params.rpe ?? 8
  const topRpe = params.phase === 'volume' ? Math.min(rawRpe, COMPOUND_VOLUME_PHASE_RPE_CEILING) : rawRpe

  const sets: SetSuggestion[] = [{
    set_type: 'top',
    suggested_weight_kg: roundWeight(oneRm * ISOLATION_FALLBACK_TOP_SET_PCT_RM),
    target_reps: reps,
    target_rpe: topRpe,
  }]
  const backoffWeight = roundWeight(oneRm * ISOLATION_FALLBACK_BACKOFF_PCT_RM)
  for (let i = 1; i < totalSets; i++) {
    sets.push({ set_type: 'backoff', suggested_weight_kg: backoffWeight, target_reps: reps, target_rpe: 8 })
  }
  return sets
}

// 1RMが未登録の種目向けフォールバック。デフォルト自動補完された種目はオンボーディングで
// 1RMを聞かれない（今やっていない種目のため答えられない、2026-07-08訂正）ため、正式な1RMが
// 一度も無い状態であっても、ユーザーが実際にログした直近セットがあればEpley推定式
// （オンボーディングの手動Epley推定と同じ式）で1RMを見積もる。ログが1件も無い
// （本当に未経験の種目）場合のみ0（表示側で「—」扱い、既存方針を維持）。
function estimateOneRmFromRecentSets(recentSets: TrainingSet[]): number {
  const workingSets = recentSets.filter(s => !s.is_warmup)
  if (workingSets.length === 0) return 0
  const estimates = workingSets.map(s => estimateOneRm(s.weight_kg, s.reps, 2.5))
  return Math.max(...estimates)
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
// 60分、または60〜90/90分の非優先部位は、ボリューム漸進が発動しない
// （このスロットの「漸進のレバー」は量ではなくエフォートになる）。
// 根拠: 低ボリューム時ほどエフォート（RIR）が代償として重要になり、限界手前(RIR1)は
// 完全限界(RIR0)とほぼ同等の肥大が得られる。ボリューム漸進は筋肉ごとに行うのが本来の
// 使い方であり、全身一律ではない（実装依頼書 2026-07-06）。
// 優先部位はユーザーがオンボーディング/設定で選択する（enrollment.priority_muscles）。
// 2026-07-08、brainstorm #9の指摘により`maxTier >= 2`から`session_duration_minutes >= 75`に
// 命名変更（ロジックは同一、新方式の「カテゴリ内tier」概念との用語衝突を解消するため）。
function volumeRampsForCategory(
  category: CompositionCategory,
  sessionDurationMinutes: SessionDurationMinutes,
  priorities: readonly PriorityMuscleOption[],
): boolean {
  return sessionDurationMinutes >= 75 && categoryMuscleIsPriority(category, priorities)
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

  const minutes = (enrollment.session_duration_minutes ?? 90) as SessionDurationMinutes
  const days = enrollment.days_per_week as DaysPerWeek
  const priorities = toPriorityMuscleOptions(enrollment.priority_muscles)

  // 種目の選定・日別配置は lib/suggest/generate_program_composition.ts（新方式:
  // 種目数=f(日数)+priority選択、Day配分=貪欲法）を正とする。DB program_slots の
  // day_number/priority/sort_orderは未使用（program_composition.tsが正）。
  const allCategories = buildExerciseCategories(days, priorities)
  const dayCategories = distributeToDays(days, allCategories).get(day_number) ?? []

  // 現在週の行だけをスロットごとの参照用マップにする。
  const currentWeekParams = weekly_params.filter(p => p.week_number === enrollment.current_week)
  const paramsMap = new Map(currentWeekParams.map(p => [p.slot_id, p]))
  const assignmentMap = new Map(assignments.map(a => [a.slot_id, a]))
  const exerciseMap = new Map(exercises.map(e => [e.id, e]))
  const oneRmMap = new Map(one_rms.map(r => [r.slot_id, r]))
  const slotByCategoryId = new Map(slots.map(s => [s.slot_id, s]))

  const phase: ProgramPhase = (() => {
    const w = enrollment.current_week
    if (w <= 4) return 'volume'
    if (w <= 7) return 'intensity'
    if (w === 8) return 'deload'
    return 'maxout'
  })()

  const slotSuggestions: SlotSuggestion[] = []

  for (const category of dayCategories) {
    const slot = slotByCategoryId.get(category.id)
    if (!slot) continue

    const params = paramsMap.get(category.id)
    if (!params || params.is_excluded) continue

    const assignment = assignmentMap.get(category.id)
    if (!assignment) continue

    const exercise = exerciseMap.get(assignment.exercise_id)
    if (!exercise) continue

    let sets: SetSuggestion[]
    const recentSets = recent_sets_by_exercise[exercise.id] ?? []

    // 1RM管理は種目ごとの属性（exercise.requires_one_rm）が正。同じ動きパターンでも
    // 1RM管理する種目としない種目が混在する（例: デッドリフト=true、ルーマニアンデッドリフト=false）
    // ため、カテゴリ単位では判定できない（2026-07-08、実機確認フィードバック対応）。
    // 週2日の格下げ対象カテゴリだけは、選ばれた種目に関わらず1RM管理を強制的にオフにする。
    const hasOneRm = exercise.requires_one_rm && !isOneRmDemotedAtDays(category, days)

    if (hasOneRm) {
      // 6パターン該当カテゴリ（チェストプレス・肩プレス・スクワット）だけが、既存の
      // 週次漸進システム（weekly_paramsのtop_set/backoff_sets）でセット数まで決める
      // 対象。それ以外の1RM管理カテゴリ（例: leg_2）は%RMで重量だけ引き継ぎ、セット数は
      // brainstorm #8の「セット数=f(セッション時間)」に従う（2026-07-08、実機確認対応）。
      const targetCount = category.isSixPattern ? null : setsForNonPatternCategory(minutes)

      // 正式な1RMが無い場合、実際にログした直近セットがあればEpley推定で1RMを見積もる
      // （デフォルト自動補完された種目はオンボーディングで1RMを聞かれないため、正式な
      // 1RMが無いままログだけ蓄積するケースがある。2026-07-08、ダンベルショルダープレスの
      // 重量が一切提案されないバグの修正——「聞いても分からない値を聞く」のではなく
      // 「実際に記録された値から推定する」方針に変更）。ログも無い場合のみ0
      // （表示側で「—」扱い、メイン/追い込みの構成自体は変えない既存方針を維持）。
      const oneRmRecord = oneRmMap.get(category.id)
      const oneRmKg = oneRmRecord?.one_rm_kg ?? estimateOneRmFromRecentSets(recentSets)
      sets = targetCount != null
        ? buildCompoundSetsForCount(params, oneRmKg, targetCount)
        : buildCompoundSets(params, oneRmKg)

      // カテゴリ既定がhasOneRm:falseのweekly_params（アイソレーション用データのみ）に、
      // 種目単位の判定で1RM管理種目が割り当てられた場合のフォールバック
      if (sets.length === 0) {
        sets = buildCompoundSetsFromIsolationParams(params, oneRmKg, targetCount ?? 0)
      }
    } else {
      if (volumeRampsForCategory(category, minutes, priorities)) {
        // 優先部位 かつ75分/90分: 既存どおりDBの週次working_sets/rpeをそのまま使う
        // （ここがボリューム漸進のターゲット方式）
        sets = buildIsolationSets(params, recentSets)
      } else {
        // 非優先部位、または60分: セット数はbrainstorm #8の「セット数=f(セッション時間)」に
        // 従って固定し（週1のDB値ではなく、旧tier別漸進レバーが参照していた
        // fixedWorkingSetsBaselineは廃止）、RIRだけをフェーズで漸進させる
        // （2026-07-08、「1RM管理種目以外でも60分なのに3〜4セットになる」フィードバック対応。
        // これまでhasOneRm:trueの非6パターンカテゴリにしか適用されていなかった）。
        sets = buildIsolationSets(params, recentSets, {
          workingSets: setsForNonPatternCategory(minutes),
          targetRpe: effortRampTargetRpe(enrollment.current_week, phase),
        })
      }
    }

    if (sets.length === 0) continue

    const noteFragments: string[] = []
    const phaseNote = slotNotes(params)
    if (phaseNote) noteFragments.push(phaseNote)

    // 60分: アイソレーション最終セットに強度テクニックを許可
    if (minutes === 60 && !hasOneRm && exercise.intensity_technique !== 'none') {
      const label = INTENSITY_TECHNIQUE_LABELS[exercise.intensity_technique]
      noteFragments.push(`最終セットは${label}で追い込みOK`)
    }

    // 拮抗筋スーパーセット: 時間が逼迫する75分でのみ提示
    if (minutes === 75) {
      const partnerCategory = findSupersetPartnerCategory(category, dayCategories)
      const partnerExerciseName = partnerCategory
        ? exerciseMap.get(assignmentMap.get(partnerCategory.id)?.exercise_id ?? '')?.name
        : undefined
      if (partnerExerciseName) {
        noteFragments.push(`「${partnerExerciseName}」とスーパーセットで時短も可能`)
      }
    }

    slotSuggestions.push({
      slot_id: category.id,
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
