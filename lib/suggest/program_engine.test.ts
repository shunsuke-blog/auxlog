// tier別漸進レバー（実装依頼書 2026-07-06）の受け入れ条件(a)(b)を検証する。
// 実行: npx tsx --test lib/suggest/program_engine.test.ts
//
// スロットは実際のPROGRAM_SLOTS定義（lib/constants/program_slots.ts）のslot_idを使う。
// day_number/所属tierは実カタログに依存するため、各テストのslot_idは
// 使用するsessionMinsで実際にアクティブなものを選んでいる
// （例: 胸のisolationスロット`chest_isolation`はtier3=90分でのみアクティブなため、
// tier1(60分)の検証には非優先部位`biceps`(tier1から常時アクティブ)を使う）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProgramSuggestion, type ProgramEngineInput } from './program_engine'
import { generateDaySlotIds } from './generate_program_slots'
import { sessionDurationToTier, type FrequencyVariant } from '@/lib/constants/program_slots'
import type {
  ProgramSlot,
  ProgramWeeklyParams,
  UserProgramEnrollment,
  UserSlotAssignment,
  UserExercise,
  UserSlotOneRm,
} from '@/types'

const PROGRAM_ID = 'test-program'
const ENROLLMENT_ID = 'test-enrollment'
const FREQ: FrequencyVariant = 2 // Full Body: 全動きパターンがDay1/2の両方で候補になり配置が単純

function resolveDayNumber(slotId: string, sessionMins: 60 | 75 | 90): number {
  const maxTier = sessionDurationToTier(sessionMins)
  const dayMap = generateDaySlotIds(FREQ, maxTier)
  for (const [day, slotIds] of dayMap) {
    if (slotIds.has(slotId)) return day
  }
  throw new Error(`slot ${slotId} is not active for freq=${FREQ} tier<=${maxTier}`)
}

function makeSlot(slotId: string, muscleGroup: string, dayNumber: number, hasOneRm = false): ProgramSlot {
  return {
    id: slotId,
    program_id: PROGRAM_ID,
    slot_id: slotId,
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
    ...overrides,
  }
}

// 実運用データを模した週次パラメータ: sets 3,3,4,4 (volume) / 4,3,3 (intensity) / 2 (deload) / 2 (maxout)
function makeIsolationWeeklyParams(slotId: string): ProgramWeeklyParams[] {
  const sets = [3, 3, 4, 4, 4, 3, 3, 2, 2]
  const rpes = [7.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.5, 9.0, 8.0]
  const phases: ProgramWeeklyParams['phase'][] = ['volume', 'volume', 'volume', 'volume', 'intensity', 'intensity', 'intensity', 'deload', 'maxout']
  return sets.map((working_sets, i) => ({
    id: `${slotId}-w${i + 1}`,
    program_id: PROGRAM_ID,
    slot_id: slotId,
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

function makeCompoundWeeklyParams(slotId: string, topSetRpeByWeek: Record<number, number>): ProgramWeeklyParams[] {
  const phases: ProgramWeeklyParams['phase'][] = ['volume', 'volume', 'volume', 'volume', 'intensity', 'intensity', 'intensity', 'deload', 'maxout']
  return phases.map((phase, i) => ({
    id: `${slotId}-w${i + 1}`,
    program_id: PROGRAM_ID,
    slot_id: slotId,
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

function buildInput(opts: {
  slot_id: string
  muscle_group: string
  hasOneRm?: boolean
  sessionMins: 60 | 75 | 90
  currentWeek: number
  weekly_params: ProgramWeeklyParams[]
  priorityMuscles?: UserProgramEnrollment['priority_muscles']
}): ProgramEngineInput {
  const dayNumber = resolveDayNumber(opts.slot_id, opts.sessionMins)
  const slot = makeSlot(opts.slot_id, opts.muscle_group, dayNumber, opts.hasOneRm)
  const exercise = makeExercise('ex1', 'テスト種目', { target_muscle: opts.muscle_group as UserExercise['target_muscle'] })
  const assignment: UserSlotAssignment = {
    id: 'a1', user_id: 'u1', enrollment_id: ENROLLMENT_ID, slot_id: opts.slot_id, exercise_id: 'ex1', created_at: '2026-01-01',
  }
  const enrollment: UserProgramEnrollment = {
    id: ENROLLMENT_ID,
    user_id: 'u1',
    program_id: PROGRAM_ID,
    current_week: opts.currentWeek,
    days_per_week: FREQ,
    session_duration_minutes: opts.sessionMins,
    // 空配列 = 未選択（program_slots.tsのデフォルト「胸」にフォールバック）
    priority_muscles: opts.priorityMuscles ?? [],
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
    assignments: [assignment],
    exercises: [exercise],
    one_rms: opts.hasOneRm ? [{ id: 'orm1', user_id: 'u1', slot_id: opts.slot_id, one_rm_kg: 100, recorded_at: '2026-01-01', source: 'manual_input' } as UserSlotOneRm] : [],
    recent_sets_by_exercise: {},
  }
}

test('(a) ~60tier(tier1): アイソレーション種目はセット数が週1の値に固定される(優先/非優先を問わず)', () => {
  const input = buildInput({
    slot_id: 'biceps', muscle_group: 'arms',
    sessionMins: 60, currentWeek: 3, // week3のDB値は4だが週1は3
    weekly_params: makeIsolationWeeklyParams('biceps'),
  })

  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 3, 'tier1では週1の値(3)に固定されるはず')
})

test('(a) ~60tier: RIRがフェーズに応じて漸進する(週1→週4でRPEが上がる)', () => {
  const params = makeIsolationWeeklyParams('biceps')

  const week1 = buildProgramSuggestion(buildInput({
    slot_id: 'biceps', muscle_group: 'arms', sessionMins: 60, currentWeek: 1, weekly_params: params,
  }))
  const week4 = buildProgramSuggestion(buildInput({
    slot_id: 'biceps', muscle_group: 'arms', sessionMins: 60, currentWeek: 4, weekly_params: params,
  }))

  const week1Rpe = week1.slots[0].sets[0].target_rpe
  const week4Rpe = week4.slots[0].sets[0].target_rpe
  assert.ok(week4Rpe > week1Rpe, `週4のRPE(${week4Rpe})は週1(${week1Rpe})より高いはず`)
})

test('(a) ~60tier: 1RM管理種目はボリューム期でRPEが9.0を超えない(RIR≥1)', () => {
  const input = buildInput({
    slot_id: 'chest_compound', muscle_group: 'chest', hasOneRm: true,
    sessionMins: 60, currentWeek: 1,
    weekly_params: makeCompoundWeeklyParams('chest_compound', { 1: 9.5, 2: 9.8 }),
  })

  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')!
  assert.ok(topSet.target_rpe <= 9.0, `ボリューム期のtop set RPE(${topSet.target_rpe})は9.0以下のはず`)
})

test('(a) maxout週(週9)のAMRAPは1RM管理種目のRPEクランプの対象外', () => {
  const input = buildInput({
    slot_id: 'chest_compound', muscle_group: 'chest', hasOneRm: true,
    sessionMins: 60, currentWeek: 9,
    weekly_params: makeCompoundWeeklyParams('chest_compound', { 9: 10.0 }),
  })

  const suggestion = buildProgramSuggestion(input)
  const topSet = suggestion.slots[0].sets.find(s => s.set_type === 'top')!
  assert.equal(topSet.target_rpe, 10.0, 'maxout週はクランプされずDBの値をそのまま使うはず')
})

test('(b) 60〜90/90tier: 優先部位(胸)はDBの週次working_setsどおりに漸増する', () => {
  const input = buildInput({
    slot_id: 'chest_isolation', muscle_group: 'chest',
    sessionMins: 90, currentWeek: 3, // week3のDB値は4
    weekly_params: makeIsolationWeeklyParams('chest_isolation'),
  })

  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 4, '優先部位はtier2/3でDBの週次値どおり漸増するはず')
})

test('(b) 60〜90/90tier: 非優先部位(腕)はセット数が週1の値に据え置かれる', () => {
  const input = buildInput({
    slot_id: 'biceps', muscle_group: 'arms',
    sessionMins: 90, currentWeek: 3, // week3のDB値は4だが非優先なので据え置き
    weekly_params: makeIsolationWeeklyParams('biceps'),
  })

  const suggestion = buildProgramSuggestion(input)
  const workingSets = suggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(workingSets.length, 3, '非優先部位は週1の値(3)に据え置かれるはず')
})

test('(b) ユーザーが優先部位を選択している場合、そちらが優先されデフォルト(胸)は上書きされる', () => {
  // 胸(デフォルト優先部位)をユーザーが選択しなかった場合、tier2/3でも据え置きになる
  const chestNotSelected = buildInput({
    slot_id: 'chest_isolation', muscle_group: 'chest',
    sessionMins: 90, currentWeek: 3,
    weekly_params: makeIsolationWeeklyParams('chest_isolation'),
    priorityMuscles: ['arms'], // 胸を選んでいない
  })
  const chestSuggestion = buildProgramSuggestion(chestNotSelected)
  const chestWorkingSets = chestSuggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(chestWorkingSets.length, 3, 'ユーザーが胸を選ばなければデフォルトより優先されず据え置きになるはず')

  // 逆にユーザーが腕を優先部位に選んでいれば、腕(通常は非優先)がボリューム漸進する
  const armsSelected = buildInput({
    slot_id: 'biceps', muscle_group: 'arms',
    sessionMins: 90, currentWeek: 3,
    weekly_params: makeIsolationWeeklyParams('biceps'),
    priorityMuscles: ['arms'],
  })
  const armsSuggestion = buildProgramSuggestion(armsSelected)
  const armsWorkingSets = armsSuggestion.slots[0].sets.filter(s => s.set_type === 'working')
  assert.equal(armsWorkingSets.length, 4, 'ユーザーが腕を優先部位に選べば腕がボリューム漸進するはず')
})
