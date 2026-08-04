// tier別漸進レバー（実装依頼書 2026-07-06、2026-07-08に新方式へ移行）の
// 受け入れ条件(a)(b)を検証する。
// 実行: npx tsx --test lib/suggest/program_engine.test.ts
//
// カテゴリは実際のprogram_composition.ts定義のidを使う。day_numberは実際に
// buildExerciseCategories/distributeToDaysで算出されるものを使う
// （例: 優先部位のカテゴリ(chest_fly)はpriorities=['chest']でのみ生成される）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProgramSuggestion, type ProgramEngineInput } from './program_engine'
import { buildExerciseCategories, distributeToDays, type DaysPerWeek, type SessionDurationMinutes } from './generate_program_composition'
import { BASE_CATEGORIES_BY_RANK, LEG_DEFAULT_CATEGORY, type PriorityMuscleOption, type CompositionCategory } from '@/lib/constants/program_composition'
import type {
  ProgramSlot,
  ProgramWeeklyParams,
  MovementPatternWeeklyParams,
  UserProgramEnrollment,
  UserSlotAssignment,
  UserExercise,
  UserSlotOneRm,
  TrainingSet,
} from '@/types'

const PROGRAM_ID = 'test-program'
const ENROLLMENT_ID = 'test-enrollment'
const DAYS: DaysPerWeek = 2 // Full Body: 動きパターンがDay1/2の両方で候補になり配置が単純

function categoryById(categoryId: string): CompositionCategory {
  for (const c of BASE_CATEGORIES_BY_RANK.values()) {
    if (c.id === categoryId) return c
  }
  if (LEG_DEFAULT_CATEGORY.id === categoryId) return LEG_DEFAULT_CATEGORY
  throw new Error(`unknown category: ${categoryId}`)
}

// カテゴリのmovementPatternを1つ返す（配列指定のカテゴリ、例: leg_2/back_2は先頭を使う）。
// テスト用exercise.movement_patternとmovement_pattern_weekly_paramsのキーを一致させるため。
function categoryMovementPattern(categoryId: string): string {
  const mp = categoryById(categoryId).movementPattern
  if (!mp) throw new Error(`category ${categoryId} has no movementPattern`)
  return Array.isArray(mp) ? mp[0] : mp
}

function resolveDayNumber(categoryId: string, priorities: PriorityMuscleOption[], days: DaysPerWeek = DAYS): number {
  const categories = buildExerciseCategories(days, priorities)
  const dayMap = distributeToDays(days, categories)
  for (const [day, cats] of dayMap) {
    if (cats.some(c => c.id === categoryId)) return day
  }
  throw new Error(`category ${categoryId} is not generated for days=${days} priorities=${priorities}`)
}

function makeSlot(categoryId: string, muscleGroup: string, dayNumber: number, hasOneRm = false): ProgramSlot {
  return {
    id: categoryId,
    program_id: PROGRAM_ID,
    slot_id: categoryId,
    day_number: dayNumber,
    muscle_group: muscleGroup,
    is_compound: hasOneRm,
    has_one_rm: hasOneRm,
    priority: 1,
    sort_order: 1,
  }
}

function makeExercise(id: string, name: string, overrides: Partial<UserExercise> = {}): UserExercise {
  return {
    id,
    user_id: 'u1',
    exercise_master_id: 'm1',
    custom_name: null,
    custom_target_muscle: null,
    default_sets: 3,
    default_reps: 10,
    weight_increment_kg: 2.5,
    sort_order: 1,
    is_active: true,
    is_bodyweight: false,
    is_compound: false,
    intensity_technique: 'none',
    created_at: '2026-01-01',
    name,
    target_muscle: 'chest',
    recent_session_ids: [],
    requires_one_rm: false,
    movement_pattern: null,
    ...overrides,
  }
}

// 実運用データを模した週次パラメータ: sets 3,3,4,4 (volume) / 4,3,3 (intensity) / 2 (deload) / 2 (maxout)
function makeIsolationWeeklyParams(categoryId: string): ProgramWeeklyParams[] {
  const sets = [3, 3, 4, 4, 4, 3, 3, 2, 2]
  const rpes = [7.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.5, 9.0, 8.0]
  const phases: ProgramWeeklyParams['phase'][] = ['volume', 'volume', 'volume', 'volume', 'intensity', 'intensity', 'intensity', 'deload', 'maxout']
  return sets.map((working_sets, i) => ({
    id: `${categoryId}-w${i + 1}`,
    program_id: PROGRAM_ID,
    slot_id: categoryId,
    week_number: i + 1,
    top_set_pct_rm: null,
    top_set_reps: null,
    top_set_is_amrap: false,
    top_set_rpe: null,
    backoff_sets: null,
    backoff_pct_rm: null,
    backoff_reps: null,
    working_sets,
    rep_range_min: 8,
    rep_range_max: 12,
    rpe: rpes[i],
    phase: phases[i],
    is_excluded: false,
  }))
}

function makeCompoundWeeklyParams(categoryId: string, topSetRpeByWeek: Record<number, number>): ProgramWeeklyParams[] {
  const phases: ProgramWeeklyParams['phase'][] = ['volume', 'volume', 'volume', 'volume', 'intensity', 'intensity', 'intensity', 'deload', 'maxout']
  return phases.map((phase, i) => ({
    id: `${categoryId}-w${i + 1}`,
    program_id: PROGRAM_ID,
    slot_id: categoryId,
    week_number: i + 1,
    top_set_pct_rm: 0.8,
    top_set_reps: 5,
    top_set_is_amrap: false,
    top_set_rpe: topSetRpeByWeek[i + 1] ?? 8,
    backoff_sets: 3,
    backoff_pct_rm: 0.75,
    backoff_reps: 5,
    working_sets: null,
    rep_range_min: null,
    rep_range_max: null,
    rpe: null,
    phase,
    is_excluded: false,
  }))
}

// weekly_params（カテゴリ単位）の%RM系フィールドから、movement_pattern単位の
// movement_pattern_weekly_paramsを機械的に導出する。実運用ではDBの別テーブルだが、
// テストでは「weekly_paramsが%RMを持つ想定」のケースをそのままmovement_pattern側に
// 流用できるようにするためのテストヘルパー（buildInputのデフォルト挙動）。
function deriveMovementPatternWeeklyParams(pattern: string, source: ProgramWeeklyParams[]): MovementPatternWeeklyParams[] {
  return source.map(p => ({
    id: `${pattern}-w${p.week_number}`,
    program_id: p.program_id,
    movement_pattern: pattern,
    week_number: p.week_number,
    top_set_pct_rm: p.top_set_pct_rm,
    top_set_reps: p.top_set_reps,
    top_set_is_amrap: p.top_set_is_amrap,
    top_set_rpe: p.top_set_rpe,
    backoff_sets: p.backoff_sets,
    backoff_pct_rm: p.backoff_pct_rm,
    backoff_reps: p.backoff_reps,
    phase: p.phase,
  }))
}

// makeCompoundWeeklyParamsと同じ形の値をmovement_pattern単位で直接作りたい場合のヘルパー
// （カテゴリ側weekly_paramsとmovement_pattern_weekly_paramsを意図的に分けたいテスト用）。
function makeMovementPatternWeeklyParams(pattern: string, topSetRpeByWeek: Record<number, number> = {}): MovementPatternWeeklyParams[] {
  return deriveMovementPatternWeeklyParams(pattern, makeCompoundWeeklyParams(pattern, topSetRpeByWeek))
}

function buildInput(opts: {
  category_id: string
  muscle_group: string
  hasOneRm?: boolean
  sessionMins: SessionDurationMinutes
  currentWeek: number
  weekly_params: ProgramWeeklyParams[]
  movement_pattern_weekly_params?: MovementPatternWeeklyParams[]
  priorityMuscles?: PriorityMuscleOption[]
  days?: DaysPerWeek
  skipOneRmRecord?: boolean
  recentSets?: TrainingSet[]
}): ProgramEngineInput {
  const priorities = opts.priorityMuscles ?? []
  const days = opts.days ?? DAYS
  const dayNumber = resolveDayNumber(opts.category_id, priorities, days)
  const slot = makeSlot(opts.category_id, opts.muscle_group, dayNumber, opts.hasOneRm)
  // hasOneRm時のみexerciseにmovement_patternを持たせる（カテゴリのmovementPatternをそのまま使う）。
  // movement_pattern_weekly_paramsは明示指定が無ければweekly_paramsの%RMフィールドから導出する。
  const movementPattern = opts.hasOneRm ? categoryMovementPattern(opts.category_id) : null
  const exercise = makeExercise('ex1', 'テスト種目', {
    target_muscle: opts.muscle_group as UserExercise['target_muscle'],
    requires_one_rm: opts.hasOneRm ?? false,
    movement_pattern: movementPattern,
  })
  const assignment: UserSlotAssignment = {
    id: 'a1', user_id: 'u1', enrollment_id: ENROLLMENT_ID, slot_id: opts.category_id, exercise_id: 'ex1', created_at: '2026-01-01',
  }
  const enrollment: UserProgramEnrollment = {
    id: ENROLLMENT_ID,
    user_id: 'u1',
    program_id: PROGRAM_ID,
    current_week: opts.currentWeek,
    days_per_week: days,
    session_duration_minutes: opts.sessionMins,
    // priority_musclesはTargetMuscle[]型。chest/back/shoulders/legs/coreはPriorityMuscleOptionと
    // 文字列が一致するためそのまま通る（program_engine.tsのtoPriorityMuscleOptions参照）。
    priority_muscles: priorities as unknown as UserProgramEnrollment['priority_muscles'],
    started_at: '2026-01-01',
    completed_at: null,
    is_active: true,
    created_at: '2026-01-01',
  }
  return {
    enrollment,
    day_number: dayNumber as 1 | 2 | 3 | 4,
    slots: [slot],
    weekly_params: opts.weekly_params,
    movement_pattern_weekly_params: opts.movement_pattern_weekly_params
      ?? (movementPattern ? deriveMovementPatternWeeklyParams(movementPattern, opts.weekly_params) : []),
    assignments: [assignment],
    exercises: [exercise],
    one_rms: (opts.hasOneRm && !opts.skipOneRmRecord) ? [{ id: 'orm1', user_id: 'u1', slot_id: opts.category_id, one_rm_kg: 100, recorded_at: '2026-01-01', source: 'manual_input' } as UserSlotOneRm] : [],
    recent_sets_by_exercise: opts.recentSets ? { ex1: opts.recentSets } : {},
    custom_slots: [],
    week_skips: [],
  }
}

test('(a) 60分: アイソレーション種目もセット数=f(セッション時間)に従う(週次DB値に引きずられない)', () => {
  // 旧仕様は「週1のDB値に固定」だったが、brainstorm #8の「セット数=f(セッション時間)」は
  // 1RM管理種目に限らずアイソレーション種目にも適用されるべきだった（これまで
  // hasOneRm:trueの非6パターンカテゴリにしか接続されておらず、アイソレーション側は
  // 旧来の週次DB値のまま=60分でも3〜4セットになるバグが残っていた。2026-07-08、
  // 「1RM管理種目以外でも60分なのに3〜4セットになる」フィードバック対応）
  const input60 = buildInput({
    category_id: 'biceps_1', muscle_group: 'arms',
    sessionMins: 60, currentWeek: 3, // week3のDB値は4、週1は3だが、どちらでもなく2になるはず
    weekly_params: makeIsolationWeeklyParams('biceps_1'),
  })
  const suggestion60 = buildProgramSuggestion(input60)
  const workingSets60 = suggestion60.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets60.length, 2, '60分はsetsForNonPatternCategory(60)=2になるはず')

  const input75 = buildInput({
    category_id: 'biceps_1', muscle_group: 'arms',
    sessionMins: 75, currentWeek: 3,
    weekly_params: makeIsolationWeeklyParams('biceps_1'),
  })
  const suggestion75 = buildProgramSuggestion(input75)
  const workingSets75 = suggestion75.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets75.length, 3, '75分(非優先部位)はsetsForNonPatternCategory(75)=3になるはず')
})

test('(a) 60分: RIRがフェーズに応じて漸進する(週1→週4でRPEが上がる)', () => {
  const params = makeIsolationWeeklyParams('biceps_1')

  const week1 = buildProgramSuggestion(buildInput({
    category_id: 'biceps_1', muscle_group: 'arms', sessionMins: 60, currentWeek: 1, weekly_params: params,
  }))
  const week4 = buildProgramSuggestion(buildInput({
    category_id: 'biceps_1', muscle_group: 'arms', sessionMins: 60, currentWeek: 4, weekly_params: params,
  }))

  const week1Rpe = week1.slots[0].sets[0].target_rpe
  const week4Rpe = week4.slots[0].sets[0].target_rpe
  assert.ok(week4Rpe > week1Rpe, `週4のRPE(${week4Rpe})は週1(${week1Rpe})より高いはず`)
})

test('(a) 60分: 1RM管理種目はボリューム期でRPEが9.0を超えない(RIR≥1)', () => {
  const input = buildInput({
    category_id: 'chest_press', muscle_group: 'chest', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeCompoundWeeklyParams('chest_press', { 1: 9.5, 2: 9.8 }),
  })

  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')!
  assert.ok(topSet.target_rpe <= 9.0, `ボリューム期のtop set RPE(${topSet.target_rpe})は9.0以下のはず`)
})

test('(a) maxout週(週9)のAMRAPは1RM管理種目のRPEクランプの対象外', () => {
  const input = buildInput({
    category_id: 'chest_press', muscle_group: 'chest', hasOneRm: true,
    sessionMins: 60, currentWeek: 9,
    weekly_params: makeCompoundWeeklyParams('chest_press', { 9: 10.0 }),
  })

  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')!
  assert.equal(topSet.target_rpe, 10.0, 'maxout週はクランプされずDBの値をそのまま使うはず')
})

test('(f/2026-07-15) leg_hinge(カテゴリのweekly_paramsはアイソレーション用データのみ)にデッドリフトのような1RM管理種目が割り当たっても、種目のmovement_pattern(hip_hinge)経由でmovement_pattern_weekly_paramsから重量が計算される', () => {
  // leg_hingeのカテゴリ単位weekly_paramsはtop_set_pct_rm等の%RM系フィールドを持たない
  // （working_sets/rep_range/rpeなどis_excluded判定・アイソレーション用のデータのみ）。
  // 2026-07-08時点では「カテゴリのweekly_paramsに%RMが無い」こと自体が問題で、暫定%RM
  // (0.8/0.75)へのフォールバックで凌いでいた。2026-07-15の構造見直しで%RM進行データを
  // movement_pattern単位(movement_pattern_weekly_params)に切り出したため、カテゴリの
  // weekly_paramsが引き続きアイソレーション用データのみでも、種目のmovement_pattern
  // (hip_hinge)に対応する行が別途あれば正しい%RMで計算される（暫定値ではなく実データ）。
  const input = buildInput({
    category_id: 'leg_hinge', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeIsolationWeeklyParams('leg_hinge'),
    movement_pattern_weekly_params: makeMovementPatternWeeklyParams('hip_hinge'),
  })
  const suggestion = buildProgramSuggestion(input)
  assert.equal(suggestion.slots.length, 1, 'スロットが消えずに1件出るはず')
  assert.ok(suggestion.slots[0].sets.length > 0, 'セットが空配列になってはいけない')
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')
  assert.ok(topSet, 'top setがあるはず')
  // buildInputのデフォルトone_rm_kgは100。makeMovementPatternWeeklyParamsのtop_set_pct_rm=0.8
  assert.equal(topSet!.suggested_weight_kg, 80, '1RM=100kgならmovement_pattern_weekly_paramsの%RM(0.8)でtop setは80kgになるはず')
})

test('(f/2026-07-15) movement_pattern_weekly_params側で1RM未設定の場合は、重量が0（ブランク扱い）になる', () => {
  const input = buildInput({
    category_id: 'leg_hinge', muscle_group: 'legs', hasOneRm: true, skipOneRmRecord: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeIsolationWeeklyParams('leg_hinge'),
    movement_pattern_weekly_params: makeMovementPatternWeeklyParams('hip_hinge'),
  })
  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')
  assert.equal(topSet!.suggested_weight_kg, 0, '1RM未設定なら重量は0（ブランク扱い）のはず')
})

test('(2026-07-15) movement_pattern_weekly_paramsに該当movement_patternの行が無ければ、暫定%RMにフォールバックせずスロットごとスキップされる', () => {
  // 2026-07-08時点のbuildCompoundSetsFromIsolationParams（暫定%RM 0.8/0.75へのフォールバック）は
  // 2026-07-15の構造見直しで廃止した。%RM進行データが本当に無い場合は、誤った暫定値で
  // 重量を出すより「スロットが出ない」形で欠落を可視化すべき、という設計判断の回帰防止テスト。
  const input = buildInput({
    category_id: 'leg_hinge', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeIsolationWeeklyParams('leg_hinge'),
    movement_pattern_weekly_params: [],
  })
  const suggestion = buildProgramSuggestion(input)
  assert.equal(suggestion.slots.length, 0, 'movement_pattern_weekly_paramsにデータが無ければスロットは出ないはず')
})

test('(c) 6パターン外の1RM管理カテゴリ(leg_2)は、週次固定値ではなくセッション時間でセット数が決まる', () => {
  // makeCompoundWeeklyParamsはtop_set 1 + backoff_sets 3 = 4セットを返す設計だが、
  // leg_2は6パターン(squat)そのものではないため、60分ならsetsForNonPatternCategory(60)=2に
  // 収まるべき（2026-07-08、実機確認フィードバック対応の回帰防止）
  const input60 = buildInput({
    category_id: 'leg_2', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 60, currentWeek: 1, days: 3,
    weekly_params: makeCompoundWeeklyParams('leg_2', {}),
  })
  const suggestion60 = buildProgramSuggestion(input60)
  assert.equal(suggestion60.slots[0].sets.length, 2, '60分のleg_2は2セットになるはず（週次固定の4セットのままではいけない）')

  const input90 = buildInput({
    category_id: 'leg_2', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 90, currentWeek: 1, days: 3,
    weekly_params: makeCompoundWeeklyParams('leg_2', {}),
  })
  const suggestion90 = buildProgramSuggestion(input90)
  assert.equal(suggestion90.slots[0].sets.length, 3, '90分のleg_2は3セットになるはず')
})

test('(d) 1RM管理は種目単位で判定される: leg_hinge(カテゴリ既定はhasOneRm:false)でも、割り当てられた種目がrequires_one_rm:trueならtop/backoffセットになる', () => {
  // デッドリフトはhip_hingeパターンの種目としてleg_hinge(hasOneRm:false)にも
  // ルーマニアンデッドリフト等と同様に割り当てられ得るが、種目自体は1RM管理対象
  // （program-slots-tier-matrix.tsvの「1RM管理」列）。カテゴリのhasOneRm:falseに
  // 引きずられて1RMを聞かない・isolationセットになるのは誤り
  // （2026-07-08、実機確認フィードバック対応の回帰防止）
  const input = buildInput({
    category_id: 'leg_hinge', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeCompoundWeeklyParams('leg_hinge', {}),
  })
  const suggestion = buildProgramSuggestion(input)
  assert.ok(suggestion.slots[0].sets.some(s => s.set_type === 'top'), 'requires_one_rm:trueの種目はtop setを持つはず')
})

test('(d) 1RM管理は種目単位で判定される: leg_squat(カテゴリ既定はhasOneRm:true)でも、割り当てられた種目がrequires_one_rm:falseならisolationセットになる', () => {
  // ブルガリアンスクワット等、squatパターンでもrequires_one_rm:falseの種目が
  // leg_squatカテゴリに割り当てられた場合、1RM未入力を前提にworking setだけになるべき
  const input = buildInput({
    category_id: 'leg_squat', muscle_group: 'legs', hasOneRm: false,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeIsolationWeeklyParams('leg_squat'),
  })
  const suggestion = buildProgramSuggestion(input)
  assert.ok(suggestion.slots[0].sets.every(s => s.set_type === 'working'), 'requires_one_rm:falseの種目はworking setのみのはず')
})

test('(e) 1RM未設定でも、requires_one_rm:trueの種目はメイン/追い込みセット構成のまま重量だけ0になる', () => {
  // 「1RMを入力しなかった場合でもメイン/追い込みセット表示にしたい。重量はブランクで
  // 良い」というフィードバック対応。旧来はworking一律・直近重量からの推測だったが、
  // buildCompoundSets系にoneRm=0を渡してtop/backoff構成を維持するよう変更した
  // （2026-07-08）
  const input = buildInput({
    category_id: 'chest_press', muscle_group: 'chest', hasOneRm: true, skipOneRmRecord: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeCompoundWeeklyParams('chest_press', {}),
  })
  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')
  assert.ok(topSet, '1RM未設定でもtop setは存在するはず')
  assert.equal(topSet!.suggested_weight_kg, 0, '1RM未設定時のtop setの重量は0（ブランク扱い）のはず')
  assert.ok(suggestion.slots[0].sets.some(s => s.set_type === 'backoff'), '1RM未設定でもbackoff setは存在するはず')
})

test('(c) 6パターンのleg_squatは引き続き週次固定値(backoff_sets)どおりのセット数になる', () => {
  const input = buildInput({
    category_id: 'leg_squat', muscle_group: 'legs', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeCompoundWeeklyParams('leg_squat', {}),
  })
  const suggestion = buildProgramSuggestion(input)
  assert.equal(suggestion.slots[0].sets.length, 4, '6パターン(squat)は60分でも週次固定の4セット(top1+backoff3)のままのはず')
})

test('(b) 75分/90分: 優先部位(胸)はDBの週次working_setsどおりに漸増する', () => {
  const input = buildInput({
    category_id: 'chest_fly', muscle_group: 'chest',
    sessionMins: 90, currentWeek: 3, // week3のDB値は4
    weekly_params: makeIsolationWeeklyParams('chest_fly'),
    priorityMuscles: ['chest'],
  })

  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 4, '優先部位は75分/90分でDBの週次値どおり漸増するはず')
})

test('(b) 75分/90分: 非優先部位(腕)はセット数がsetsForNonPatternCategory(minutes)に固定される(週次DB値には引きずられない)', () => {
  const input = buildInput({
    category_id: 'biceps_1', muscle_group: 'arms',
    sessionMins: 90, currentWeek: 3, // week3のDB値は4だが非優先なのでsetsForNonPatternCategory(90)=3に固定
    weekly_params: makeIsolationWeeklyParams('biceps_1'),
  })

  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 3, '非優先部位はsetsForNonPatternCategory(90)=3に固定されるはず')
})

test('(2026-07-17) ドロップセット構成では、セットごとに前回の実績(set_number)に応じて独立に重量が調整される', () => {
  // オーナー指摘: 30kg×7回・25kg×10回・20kg×13回(rep_range 8〜12)を組んでいる場合、
  // 「セット1が未達だからセット3(元々軽い設定)まで一律で下げる」のは誤り。各セットは
  // 独立して判定されるべき（1セット目: 7回<8回min→-2.5、2セット目: 10回はレンジ内→据え置き、
  // 3セット目: 13回>12回max→+2.5）。
  const recentSets: TrainingSet[] = [
    { id: 's1', session_id: 'sess1', exercise_id: 'ex1', set_number: 1, weight_kg: 30, reps: 7, rir: false, is_warmup: false, created_at: '2026-07-10T10:00:00Z' },
    { id: 's2', session_id: 'sess1', exercise_id: 'ex1', set_number: 2, weight_kg: 25, reps: 10, rir: false, is_warmup: false, created_at: '2026-07-10T10:05:00Z' },
    { id: 's3', session_id: 'sess1', exercise_id: 'ex1', set_number: 3, weight_kg: 20, reps: 13, rir: false, is_warmup: false, created_at: '2026-07-10T10:10:00Z' },
  ]
  const input = buildInput({
    category_id: 'back_2', muscle_group: 'back',
    sessionMins: 90, currentWeek: 1, // week1のDB working_sets=3
    weekly_params: makeIsolationWeeklyParams('back_2'),
    priorityMuscles: ['back'],
    recentSets,
  })
  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 3)
  assert.deepEqual(
    workingSets.map(s => s.suggested_weight_kg),
    [27.5, 25, 22.5],
    'セットごとに独立して調整され、全セット同一重量になってはいけない',
  )
})

test('(2026-07-17) 今回のセット数が前回より多い場合、対応する前回セットが無い分は前回の最終セットの重量を初期値にする', () => {
  const recentSets: TrainingSet[] = [
    { id: 's1', session_id: 'sess1', exercise_id: 'ex1', set_number: 1, weight_kg: 30, reps: 10, rir: false, is_warmup: false, created_at: '2026-07-10T10:00:00Z' },
    { id: 's2', session_id: 'sess1', exercise_id: 'ex1', set_number: 2, weight_kg: 25, reps: 10, rir: false, is_warmup: false, created_at: '2026-07-10T10:05:00Z' },
  ]
  const input = buildInput({
    category_id: 'back_2', muscle_group: 'back',
    sessionMins: 90, currentWeek: 3, // week3のDB working_sets=4（前回は2セットのみログ）
    weekly_params: makeIsolationWeeklyParams('back_2'),
    priorityMuscles: ['back'],
    recentSets,
  })
  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 4)
  assert.deepEqual(
    workingSets.map(s => s.suggested_weight_kg),
    [30, 25, 25, 25],
    '前回セットが無い3・4セット目は前回最終セット(25kg)を初期値として使うはず',
  )
})

test('(2026-07-20) 前回レンジ未達でもRIR「余裕」申告なら減量しない(疲労で回数が落ちただけを未達成と誤判定しない)', () => {
  // オーナー報告: 懸垂で5kg×10回・7.5kg×10回・7.5kg×9回(rep_range 10〜12)を
  // 全セット「余裕」で記録したのに、3セット目(9回<10回min)だけ機械的に-2.5された。
  // RIRが「余裕」と自己申告している以上、レンジ未達は重量が重すぎたからではない。
  const recentSets: TrainingSet[] = [
    { id: 's1', session_id: 'sess1', exercise_id: 'ex1', set_number: 1, weight_kg: 30, reps: 10, rir: true, is_warmup: false, created_at: '2026-07-10T10:00:00Z' },
    { id: 's2', session_id: 'sess1', exercise_id: 'ex1', set_number: 2, weight_kg: 32.5, reps: 10, rir: true, is_warmup: false, created_at: '2026-07-10T10:05:00Z' },
    { id: 's3', session_id: 'sess1', exercise_id: 'ex1', set_number: 3, weight_kg: 32.5, reps: 7, rir: true, is_warmup: false, created_at: '2026-07-10T10:10:00Z' },
  ]
  const input = buildInput({
    category_id: 'back_2', muscle_group: 'back',
    sessionMins: 90, currentWeek: 1, // week1のDB working_sets=3
    weekly_params: makeIsolationWeeklyParams('back_2'),
    priorityMuscles: ['back'],
    recentSets,
  })
  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 3)
  assert.deepEqual(
    workingSets.map(s => s.suggested_weight_kg),
    [30, 32.5, 32.5],
    'RIR「余裕」申告のセットはレンジ未達でも据え置きのはず(3セット目が30に下がってはいけない)',
  )
})

test('(2026-07-20) 前回レンジ未達でRIR「限界」申告なら従来通り減量する(RIR未対応の既存挙動を維持)', () => {
  const recentSets: TrainingSet[] = [
    { id: 's1', session_id: 'sess1', exercise_id: 'ex1', set_number: 1, weight_kg: 30, reps: 7, rir: false, is_warmup: false, created_at: '2026-07-10T10:00:00Z' },
  ]
  const input = buildInput({
    category_id: 'back_2', muscle_group: 'back',
    sessionMins: 90, currentWeek: 8, // week8のDB working_sets=2
    weekly_params: makeIsolationWeeklyParams('back_2'),
    priorityMuscles: ['back'],
    recentSets,
  })
  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets[0].suggested_weight_kg, 27.5, 'RIR「限界」申告(rir:false)ならレンジ未達で従来通り-2.5されるはず')
})

test('(b) ユーザーの優先部位選択によってボリューム漸進の対象が切り替わる', () => {
  // priority=['back']のとき、priority枠(rank10)に入るback_2は75分/90分で漸増する
  const backSelected = buildInput({
    category_id: 'back_2', muscle_group: 'back',
    sessionMins: 90, currentWeek: 3,
    weekly_params: makeIsolationWeeklyParams('back_2'),
    priorityMuscles: ['back'],
  })
  const backSuggestion = buildProgramSuggestion(backSelected)
  const backWorkingSets = backSuggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(backWorkingSets.length, 4, 'ユーザーが背中を優先部位に選べば背中がボリューム漸進するはず')

  // 同じpriority=['back']でも、選ばれていない腕(biceps_1、base9由来で常時存在)は据え置き
  const armsNotSelected = buildInput({
    category_id: 'biceps_1', muscle_group: 'arms',
    sessionMins: 90, currentWeek: 3,
    weekly_params: makeIsolationWeeklyParams('biceps_1'),
    priorityMuscles: ['back'],
  })
  const armsSuggestion = buildProgramSuggestion(armsNotSelected)
  const armsWorkingSets = armsSuggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(armsWorkingSets.length, 3, '選ばれていない部位は据え置きになるはず')
})
