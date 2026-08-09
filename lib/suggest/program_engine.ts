import type {
  ProgramSlot,
  ProgramWeeklyParams,
  MovementPatternWeeklyParams,
  UserSlotAssignment,
  UserCustomSlot,
  UserSlotWeekSkip,
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
  movement_pattern_weekly_params: MovementPatternWeeklyParams[]
  assignments: UserSlotAssignment[]
  exercises: UserExercise[]
  one_rms: UserSlotOneRm[]
  recent_sets_by_exercise: Record<string, TrainingSet[]>
  // 動きパターン単位: 直近セッション(種目を変えていても同じ動きパターンなら対象)で
  // ウォームアップが記録されていたか。コンパウンド種目のウォームアップ提案に使う
  // （2026-08-09）。
  recent_warmup_by_pattern: Record<string, boolean>
  custom_slots: UserCustomSlot[]
  week_skips: UserSlotWeekSkip[]
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

// 直近セッション(同じ動きパターン、種目を変えていても対象)でウォームアップが記録されて
// いた場合のみ、1セット目に重量・回数ブランクのウォームアップ枠を提案する。計算式は無く、
// 前回やっていたかどうかをそのまま引き継ぐだけ（2026-08-09）。
function maybeAddWarmupSet(sets: SetSuggestion[], hasRecentWarmup: boolean): SetSuggestion[] {
  if (!hasRecentWarmup || sets.length === 0) return sets
  return [{ set_type: 'warmup', suggested_weight_kg: 0, target_reps: 0, target_rpe: 5 }, ...sets]
}

function buildCompoundSets(
  params: MovementPatternWeeklyParams,
  { oneRm, hasRecentWarmup }: { oneRm: number; hasRecentWarmup: boolean }
): SetSuggestion[] {
  const sets: SetSuggestion[] = []

  let topWeight: number | undefined

  if (params.top_set_pct_rm != null && (params.top_set_reps != null || params.top_set_is_amrap)) {
    const rawRpe = params.top_set_rpe ?? 9
    const targetRpe = params.phase === 'volume'
      ? Math.min(rawRpe, COMPOUND_VOLUME_PHASE_RPE_CEILING)
      : rawRpe

    topWeight = roundWeight(oneRm * params.top_set_pct_rm)
    sets.push({
      set_type: 'top',
      suggested_weight_kg: topWeight,
      target_reps: params.top_set_is_amrap ? 'amrap' : params.top_set_reps!,
      target_rpe: targetRpe,
    })
  }

  // backoff重量はメインセットの提案重量に対する倍率で決める（元データ＝
  // UpperLowerBodyhypertrophy9weeks_sheet.xlsxのBackoff行が参考重量ベースの倍率で
  // 管理されているため。1RMから独立したbackoff_pct_rmは丸め誤差でズレるので使わない）。
  if (params.backoff_sets && topWeight != null && params.backoff_pct_of_top != null && params.backoff_reps) {
    const backoffWeight = roundWeight(topWeight * params.backoff_pct_of_top)
    for (let i = 0; i < params.backoff_sets; i++) {
      sets.push({
        set_type: 'backoff',
        suggested_weight_kg: backoffWeight,
        target_reps: params.backoff_reps,
        target_rpe: 8,
      })
    }
  }

  return maybeAddWarmupSet(sets, hasRecentWarmup)
}

// 6パターン以外の1RM管理カテゴリ（例: leg_2）は、%RMという重量計算方法だけ既存の
// buildCompoundSetsと共有しつつ、セット数は週次固定値ではなくbrainstorm #8の
// 「セット数=f(セッション時間)」に従わせる。backoff_setsの数を無視し、
// targetCountちょうどになるまでtop set→backoff setの順に詰める
// （2026-07-08、実機確認フィードバック対応。isSixPatternのみ旧来のbuildCompoundSetsのまま）。
function buildCompoundSetsForCount(
  params: MovementPatternWeeklyParams,
  { oneRm, targetCount, hasRecentWarmup }: { oneRm: number; targetCount: number; hasRecentWarmup: boolean }
): SetSuggestion[] {
  const sets: SetSuggestion[] = []

  let topWeight: number | undefined

  if (params.top_set_pct_rm != null && (params.top_set_reps != null || params.top_set_is_amrap) && targetCount > 0) {
    const rawRpe = params.top_set_rpe ?? 9
    const targetRpe = params.phase === 'volume'
      ? Math.min(rawRpe, COMPOUND_VOLUME_PHASE_RPE_CEILING)
      : rawRpe

    topWeight = roundWeight(oneRm * params.top_set_pct_rm)
    sets.push({
      set_type: 'top',
      suggested_weight_kg: topWeight,
      target_reps: params.top_set_is_amrap ? 'amrap' : params.top_set_reps!,
      target_rpe: targetRpe,
    })
  }

  const remaining = targetCount - sets.length
  if (remaining > 0 && topWeight != null && params.backoff_pct_of_top != null && params.backoff_reps) {
    const backoffWeight = roundWeight(topWeight * params.backoff_pct_of_top)
    for (let i = 0; i < remaining; i++) {
      sets.push({
        set_type: 'backoff',
        suggested_weight_kg: backoffWeight,
        target_reps: params.backoff_reps,
        target_rpe: 8,
      })
    }
  }

  return maybeAddWarmupSet(sets, hasRecentWarmup)
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

// 1セット単体の実績(直近セッションの同じset_number)から次回の重量を判定する。
// レンジ上限超え→+2.5、下限未達→-2.5、レンジ内→据え置き。セット同士をまとめて
// 判定しない（ドロップセットのように意図的にセットごと重量が違う構成で、1セットの
// 未達が他セットの重量まで引き下げてしまう不具合の修正。2026-07-17）。
// prevRirがtrue（「余裕」申告）の場合はレンジ未達でも減量しない。RIR自己申告が「まだ
// 余力があった」と言っている以上、レンジ未達は重量が重すぎたからではなく疲労等の別要因
// による一時的な落ち込みである可能性が高く、それを「未達成」として機械的に罰すると
// 直前セットで余裕を持って止めただけのケースまで不当に重量が下がってしまう（2026-07-20）。
function adjustIsolationWeight(prevWeight: number, prevReps: number, prevRir: boolean, params: Pick<ProgramWeeklyParams, 'rep_range_min' | 'rep_range_max'>): number {
  const minReps = params.rep_range_min ?? 0
  const maxReps = params.rep_range_max ?? 9999
  if (prevReps > maxReps) return prevWeight + 2.5
  if (prevReps < minReps && !prevRir) return Math.max(0, prevWeight - 2.5)
  return prevWeight
}

function buildIsolationSets(
  params: Pick<ProgramWeeklyParams, 'rep_range_min' | 'rep_range_max' | 'rpe' | 'working_sets'>,
  recentSets: TrainingSet[],
  overrides?: { workingSets?: number | null; targetRpe?: number },
): SetSuggestion[] {
  const workingSetsCount = overrides?.workingSets ?? params.working_sets
  if (!workingSetsCount) return []

  // recentSetsはroute.ts側で種目ごとに直近14日内の最新1セッションのみに絞り込み済み
  // （2026-07-17）。set_number単位でその1セッション内の実績を引き当てる。
  const prevByPosition = new Map<number, TrainingSet>()
  for (const set of recentSets) {
    if (set.is_warmup) continue
    const existing = prevByPosition.get(set.set_number)
    if (!existing || set.created_at > existing.created_at) {
      prevByPosition.set(set.set_number, set)
    }
  }

  // 今回のセット数が前回より多い場合、対応する前回セットが無い分は前回セッションの
  // 最終セットの重量を初期値として使う（達成状況を判定する材料が無いため調整はしない）。
  const knownPositions = Array.from(prevByPosition.keys()).sort((a, b) => a - b)
  const lastKnownSet = knownPositions.length > 0
    ? prevByPosition.get(knownPositions[knownPositions.length - 1])
    : undefined

  return Array.from({ length: workingSetsCount }, (_, i) => {
    const position = i + 1
    const prev = prevByPosition.get(position)
    const suggestedWeight = prev
      ? adjustIsolationWeight(prev.weight_kg, prev.reps, prev.rir, params)
      : (lastKnownSet ? lastKnownSet.weight_kg : 0)

    return {
      set_type: 'working' as const,
      suggested_weight_kg: suggestedWeight,
      target_reps: params.rep_range_min ?? 10,
      rep_range_min: params.rep_range_min ?? undefined,
      rep_range_max: params.rep_range_max ?? undefined,
      target_rpe: overrides?.targetRpe ?? params.rpe ?? 8,
    }
  })
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

function slotNotes(params: Pick<ProgramWeeklyParams, 'phase' | 'top_set_is_amrap'>): string | undefined {
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
    movement_pattern_weekly_params,
    assignments,
    exercises,
    one_rms,
    recent_sets_by_exercise,
    recent_warmup_by_pattern,
    custom_slots,
    week_skips,
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
  // 1RM管理種目の%RM進行データは、種目のmovement_pattern単位で引く（カテゴリ単位ではない。
  // 2026-07-15、is_compound/requires_one_rm不一致調査を受けた構造見直し）。
  const currentWeekMovementParams = movement_pattern_weekly_params.filter(p => p.week_number === enrollment.current_week)
  const movementParamsMap = new Map(currentWeekMovementParams.map(p => [p.movement_pattern, p]))
  const assignmentMap = new Map(assignments.map(a => [a.slot_id, a]))
  const exerciseMap = new Map(exercises.map(e => [e.id, e]))
  const oneRmMap = new Map(one_rms.map(r => [r.slot_id, r]))
  const slotByCategoryId = new Map(slots.map(s => [s.slot_id, s]))
  // ホーム画面のスワイプ削除は「その週だけスキップ」。is_hidden（プログラム期間中ずっと非表示、
  // コーチングタブの「この種目を外す」用）とは別に週番号付きで記録する（2026-08-04）。
  const skippedSlotIds = new Set(
    week_skips.filter(s => s.week_number === enrollment.current_week).map(s => s.slot_id),
  )

  const phase: ProgramPhase = (() => {
    const w = enrollment.current_week
    if (w <= 4) return 'volume'
    if (w <= 7) return 'intensity'
    if (w === 8) return 'deload'
    return 'maxout'
  })()

  const slotSuggestions: SlotSuggestion[] = []

  for (const category of dayCategories) {
    if (skippedSlotIds.has(category.id)) continue

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

    // hasOneRm時のみ参照する%RM進行データの出典（notesの週次フェーズ表示にも使う）。
    let movementParams: MovementPatternWeeklyParams | undefined

    if (hasOneRm) {
      // %RM進行データは種目のmovement_pattern単位（movement_pattern_weekly_params）で引く。
      // カテゴリ既定がhasOneRm:falseでも（leg_hingeにデッドリフト、shoulder_press_2に
      // ダンベルショルダープレス等）、種目のmovement_patternが一致すれば同じ進行データを
      // 共有できる（2026-07-15、is_compound/requires_one_rm不一致調査を受けた構造見直し。
      // 旧buildCompoundSetsFromIsolationParamsの暫定%RMフォールバックは不要になり削除）。
      movementParams = movementParamsMap.get(exercise.movement_pattern ?? '')
      if (!movementParams) continue

      // 6パターン該当カテゴリ（チェストプレス・肩プレス・スクワット）だけが、既存の
      // 週次漸進システム（movement_pattern_weekly_paramsのtop_set/backoff_sets）でセット数まで
      // 決める対象。それ以外の1RM管理カテゴリ（例: leg_2）は%RMで重量だけ引き継ぎ、セット数は
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
      const hasRecentWarmup = recent_warmup_by_pattern[exercise.movement_pattern ?? ''] ?? false
      sets = targetCount != null
        ? buildCompoundSetsForCount(movementParams, { oneRm: oneRmKg, targetCount, hasRecentWarmup })
        : buildCompoundSets(movementParams, { oneRm: oneRmKg, hasRecentWarmup })
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
    // 1RM管理種目はmovement_pattern_weekly_params側にphase/top_set_is_amrapがある
    // （カテゴリ側のparams.phaseは同じ週なら実質同値だが、is_excluded判定用に別途
    // 存在するparamsとは出典が分かれたため、hasOneRm時はmovementParamsを正とする）。
    const phaseNote = slotNotes(hasOneRm ? movementParams! : params)
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

  // ユーザーがコーチングタブから追加したカスタムスロット（24カテゴリ外）。program_weekly_params等の
  // 週次DB行を一切必要とせず、非優先部位カテゴリと同じ「セット数=f(セッション時間)、
  // RPE=f(週・フェーズ)」の純粋関数だけでアイソレーション計算する（2026-08-03）。
  for (const customSlot of custom_slots) {
    if (customSlot.day_number !== day_number) continue
    if (skippedSlotIds.has(customSlot.id)) continue

    const exercise = exerciseMap.get(customSlot.exercise_id)
    if (!exercise) continue

    const recentSets = recent_sets_by_exercise[exercise.id] ?? []
    const sets = buildIsolationSets(
      { rep_range_min: customSlot.rep_range_min, rep_range_max: customSlot.rep_range_max, rpe: null, working_sets: null },
      recentSets,
      {
        workingSets: setsForNonPatternCategory(minutes),
        targetRpe: effortRampTargetRpe(enrollment.current_week, phase),
      },
    )
    if (sets.length === 0) continue

    const syntheticSlot: ProgramSlot = {
      id: customSlot.id,
      program_id: enrollment.program_id,
      slot_id: customSlot.id,
      day_number: customSlot.day_number,
      muscle_group: customSlot.muscle_group,
      is_compound: false,
      has_one_rm: false,
      priority: 3,
      sort_order: 999,
    }

    slotSuggestions.push({
      slot_id: customSlot.id,
      slot: syntheticSlot,
      exercise,
      sets,
      is_custom: true,
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
