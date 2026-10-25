// 「Auxlogで作成」のベーステンプレート（固定テンプレート方式、2026-10-24 オーナー決定）。
//
// 動的な割り振り（generate_program_composition.ts）をやめ、プロが組んだ分割法の骨組みを定数で持つ。
// テンプレートは枠組みだけ（種目・並び順・何分コースから含めるか）で、重量・強度・セット数・回数は
// 生成時に DB の週ごとの値（movement_pattern_weekly_params / program_weekly_params）から入れる。
// 元データ: オーナー作成の「AUXLOG Base Templates」（週2〜4日、2026-10-24）と「週5~7.ts」（2026-10-24）、
// 初心者向け・女性向け（「AUXLOG Base Templates (1)」、2026-10-25）。
//
// プログラムの種類（2026-10-25 オーナー決定）:
//   - 初心者を選んだら、性別に関係なく初心者向け（週2・3日）
//   - 中級者以上で女性向けなら女性向け（週2〜4日）、男性向けなら通常（週2〜7日）
//   - テンプレートが無い日数は選べない
//
// 種目は exercise_master.code で指定する（名前を直してもテンプレートが壊れない）。

import type { PriorityMuscleOption } from '@/types'

export type SessionMinutes = 60 | 75 | 90

/** Day の種類。重点部位の差し替え（改定ルール③）でどの日が対象になるかに使う */
export type DayKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'recovery'

/** 種目の部位（重点部位の保護・差し替えの判定に使う。ふくらはぎは脚の一部） */
export type TemplateMuscle = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core'

/** 差し替えの対象になる枠の役割 */
export type SwapRole = 'triceps' | 'biceps' | 'shoulder_rear' | 'calf'

export type TemplateExercise = {
  /** テンプレート上の枠の名前（表示・テスト用） */
  slot: string
  /** 種目（exercise_master.code） */
  code: string
  muscle: TemplateMuscle
  /** この時間のコースから含める（60 = 〜60分でも入れる） */
  minMinutes: SessionMinutes
  /** 1RM管理でない種目の週ごとの値を引く program_weekly_params.slot_id。
   *  1RM管理の種目は種目の動き（movement_pattern）で movement_pattern_weekly_params を引く */
  params: string
  role?: SwapRole
  /** 1RM管理（重量を%で出す）かどうかをテンプレートで指定する。省略時は種目マスタの登録に従う。
   *  false: 週5〜7日のダンベルショルダープレスなど。true: 初心者向けのマシンチェストプレスなど */
  oneRm?: boolean
  /** 時間で行う種目（プランク）。回数の欄に秒数を入れる（2026-10-25 オーナー決定） */
  timed?: { minSec: number; maxSec: number }
}

export type TemplateDay = { day: number; name: string; kind: DayKind; exercises: TemplateExercise[] }

export type BaseTemplate = { daysPerWeek: number; name: string; days: TemplateDay[] }

const ex = (slot: string, code: string, muscle: TemplateMuscle, minMinutes: SessionMinutes, params: string, role?: SwapRole, oneRm?: boolean): TemplateExercise =>
  ({ slot, code, muscle, minMinutes, params, ...(role ? { role } : {}), ...(oneRm !== undefined ? { oneRm } : {}) })

/** プランク（30〜60秒キープ）。セット数・努力度は腹筋の枠の値を使う */
const plank = (slot: string, minMinutes: SessionMinutes): TemplateExercise =>
  ({ slot, code: 'plank', muscle: 'core', minMinutes, params: 'core', timed: { minSec: 30, maxSec: 60 } })

// 全身 A / B（週2日・週3日で共通）
const FULL_A: TemplateExercise[] = [
  ex('squat', 'low_bar_squat', 'legs', 60, 'leg_squat'),
  ex('chest_press', 'barbell_bench_press', 'chest', 60, 'chest_press'),
  ex('back_horizontal_pull', 'chest_supported_row', 'back', 60, 'back_horizontal_pull'),
  ex('triceps', 'lying_triceps_extension', 'triceps', 75, 'triceps', 'triceps'),
  ex('core', 'ab_roller', 'core', 60, 'core'),
]
const FULL_B: TemplateExercise[] = [
  ex('deadlift', 'deadlift', 'legs', 60, 'leg_hinge'),
  ex('shoulder_press', 'overhead_press', 'shoulders', 60, 'shoulder_press'),
  ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
  ex('biceps', 'dumbbell_curl', 'biceps', 75, 'biceps', 'biceps'),
  ex('calf', 'seated_calf_raise', 'legs', 90, 'calves_seated', 'calf'),
]

// Lower A（週4日の Day2 と週5日の Day2 で共通）
const LOWER_A: TemplateExercise[] = [
  ex('squat', 'low_bar_squat', 'legs', 60, 'leg_squat'),
  ex('hip_hinge', 'romanian_deadlift', 'legs', 60, 'hamstring_glute'),
  ex('leg_single', 'bulgarian_split_squat', 'legs', 75, 'quad_glute_secondary'),
  ex('calf', 'seated_calf_raise', 'legs', 75, 'calves_seated', 'calf'),
  ex('core', 'ab_roller', 'core', 60, 'core'),
]

// Push / Pull / Legs × 2（週6日・週7日の Day1〜6 で共通）
const PPL_X2: TemplateDay[] = [
  {
    day: 1, name: 'Push A（胸メイン・肩・三頭）', kind: 'push', exercises: [
      ex('chest_press', 'barbell_bench_press', 'chest', 60, 'chest_press'),
      ex('shoulder_press', 'dumbbell_shoulder_press', 'shoulders', 60, 'shoulder_press_2', undefined, false),
      ex('chest_fly', 'cable_fly', 'chest', 60, 'chest_fly'),
      ex('shoulder_side', 'side_raise', 'shoulders', 75, 'shoulder_lateral'),
      ex('triceps', 'lying_triceps_extension', 'triceps', 75, 'triceps', 'triceps'),
    ],
  },
  {
    day: 2, name: 'Pull A（背中垂直メイン・後部肩・二頭）', kind: 'pull', exercises: [
      ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
      ex('back_horizontal_pull', 'chest_supported_row', 'back', 60, 'back_horizontal_pull'),
      ex('shoulder_rear', 'face_pull', 'shoulders', 60, 'shoulder_rear_delt', 'shoulder_rear'),
      ex('biceps', 'dumbbell_curl', 'biceps', 75, 'biceps', 'biceps'),
      ex('back_pullover', 'straight_arm_pulldown', 'back', 90, 'back_vertical_pull'),
    ],
  },
  {
    day: 3, name: 'Legs A（四頭メイン・ハム・カーフ・腹筋）', kind: 'legs', exercises: [
      ex('squat', 'low_bar_squat', 'legs', 60, 'leg_squat'),
      ex('hip_hinge', 'romanian_deadlift', 'legs', 60, 'hamstring_glute'),
      ex('core', 'ab_roller', 'core', 60, 'core'),
      ex('leg_curl', 'leg_curl', 'legs', 75, 'leg_curl'),
      ex('calf', 'seated_calf_raise', 'legs', 90, 'calves_seated', 'calf'),
    ],
  },
  {
    day: 4, name: 'Push B（肩メイン・胸・三頭）', kind: 'push', exercises: [
      ex('shoulder_press2', 'overhead_press', 'shoulders', 60, 'shoulder_press'),
      ex('chest_press2', 'incline_dumbbell_press', 'chest', 60, 'chest_press'),
      ex('triceps2', 'triceps_pushdown', 'triceps', 60, 'triceps', 'triceps'),
      ex('chest_fly2', 'pec_deck_fly', 'chest', 75, 'chest_isolation'),
      ex('shoulder_side2', 'cable_side_raise', 'shoulders', 90, 'shoulder_lateral_cable'),
    ],
  },
  {
    day: 5, name: 'Pull B（背中水平メイン・後部肩・二頭）', kind: 'pull', exercises: [
      ex('back_horizontal_pull2', 'one_hand_row', 'back', 60, 'back_horizontal_pull_heavy'),
      ex('back_vertical_pull2', 'pull_up', 'back', 60, 'back_vertical_pull_alt'),
      ex('biceps2', 'incline_dumbbell_curl', 'biceps', 60, 'biceps_alt', 'biceps'),
      ex('shoulder_rear2', 'rear_delt_fly', 'shoulders', 75, 'shoulder_rear_delt_alt', 'shoulder_rear'),
      ex('biceps3', 'hammer_curl', 'biceps', 90, 'biceps_2', 'biceps'),
    ],
  },
  {
    day: 6, name: 'Legs B（ハムメイン・四頭・カーフ・腹筋）', kind: 'legs', exercises: [
      ex('deadlift', 'deadlift', 'legs', 60, 'leg_hinge'),
      ex('squat2', 'leg_press', 'legs', 60, 'leg_2'),
      ex('core2', 'cable_crunch', 'core', 60, 'core_alt'),
      ex('leg_extension', 'leg_extension', 'legs', 75, 'leg_curl'),
      ex('calf2', 'standing_calf_raise', 'legs', 90, 'calves_standing', 'calf'),
    ],
  },
]

export const BASE_TEMPLATES: Record<number, BaseTemplate> = {
  2: {
    daysPerWeek: 2,
    name: '全身 A / 全身 B',
    days: [
      { day: 1, name: '全身 A（胸・前モモ・背中水平・三頭・腹筋）', kind: 'full', exercises: FULL_A },
      { day: 2, name: '全身 B（裏モモ・肩・背中垂直・二頭・カーフ）', kind: 'full', exercises: FULL_B },
    ],
  },
  3: {
    daysPerWeek: 3,
    name: '全身 A / B / C',
    days: [
      { day: 1, name: '全身 A（胸・前モモ・背中水平・三頭・腹筋）', kind: 'full', exercises: FULL_A },
      { day: 2, name: '全身 B（裏モモ・肩・背中垂直・二頭・カーフ）', kind: 'full', exercises: FULL_B },
      {
        day: 3, name: '全身 C（脚・胸・背中・腕・腹筋）', kind: 'full', exercises: [
          ex('leg_press', 'leg_press', 'legs', 60, 'leg_2'),
          ex('chest_fly', 'cable_fly', 'chest', 60, 'chest_fly'),
          ex('back_horizontal_pull', 'one_hand_row', 'back', 60, 'back_horizontal_pull'),
          ex('biceps', 'incline_dumbbell_curl', 'biceps', 75, 'biceps', 'biceps'),
          ex('triceps', 'triceps_pushdown', 'triceps', 75, 'triceps', 'triceps'),
          ex('core', 'cable_crunch', 'core', 90, 'core'),
        ],
      },
    ],
  },
  4: {
    daysPerWeek: 4,
    name: 'Upper A / Lower A / Upper B / Lower B',
    days: [
      {
        day: 1, name: 'Upper A（胸・背中・肩・腕）', kind: 'upper', exercises: [
          ex('chest_press', 'barbell_bench_press', 'chest', 60, 'chest_press'),
          ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
          ex('back_horizontal_pull', 'chest_supported_row', 'back', 60, 'back_horizontal_pull'),
          ex('shoulder_side', 'side_raise', 'shoulders', 75, 'shoulder_lateral'),
          ex('shoulder_rear', 'face_pull', 'shoulders', 75, 'shoulder_rear_delt', 'shoulder_rear'),
          ex('triceps', 'lying_triceps_extension', 'triceps', 90, 'triceps', 'triceps'),
          ex('biceps', 'dumbbell_curl', 'biceps', 90, 'biceps', 'biceps'),
        ],
      },
      { day: 2, name: 'Lower A（四頭・ハム・カーフ・腹筋）', kind: 'lower', exercises: LOWER_A },
      {
        day: 3, name: 'Upper B（肩・胸・背中・腕）', kind: 'upper', exercises: [
          ex('shoulder_press', 'overhead_press', 'shoulders', 60, 'shoulder_press'),
          ex('chest_triceps', 'narrow_bench_press', 'chest', 60, 'chest_triceps_compound'),
          ex('back_horizontal_pull2', 'one_hand_row', 'back', 60, 'back_horizontal_pull_heavy'),
          ex('back_vertical_pull2', 'pull_up', 'back', 75, 'back_vertical_pull_alt'),
          ex('chest_fly', 'cable_fly', 'chest', 75, 'chest_fly'),
          ex('shoulder_side2', 'cable_side_raise', 'shoulders', 90, 'shoulder_lateral_cable'),
          ex('biceps2', 'incline_dumbbell_curl', 'biceps', 90, 'biceps_alt', 'biceps'),
        ],
      },
      {
        day: 4, name: 'Lower B（ハム・四頭・カーフ・腹筋）', kind: 'lower', exercises: [
          ex('deadlift', 'deadlift', 'legs', 60, 'leg_hinge'),
          ex('squat2', 'high_bar_squat', 'legs', 60, 'leg_squat'),
          ex('calf2', 'standing_calf_raise', 'legs', 75, 'calves_standing', 'calf'),
          ex('core2', 'leg_raise', 'core', 60, 'core_alt'),
        ],
      },
    ],
  },
  5: {
    daysPerWeek: 5,
    name: 'Upper / Lower / Push / Pull / Legs',
    days: [
      {
        day: 1, name: 'Upper（胸・背中・肩・腕）', kind: 'upper', exercises: [
          ex('chest_press', 'barbell_bench_press', 'chest', 60, 'chest_press'),
          ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
          ex('shoulder_press', 'dumbbell_shoulder_press', 'shoulders', 60, 'shoulder_press_2', undefined, false),
          ex('back_horizontal_pull', 'chest_supported_row', 'back', 75, 'back_horizontal_pull'),
          ex('shoulder_side', 'side_raise', 'shoulders', 75, 'shoulder_lateral'),
          ex('triceps', 'lying_triceps_extension', 'triceps', 90, 'triceps', 'triceps'),
          ex('biceps', 'dumbbell_curl', 'biceps', 90, 'biceps', 'biceps'),
        ],
      },
      { day: 2, name: 'Lower（四頭・ハム・カーフ・腹筋）', kind: 'lower', exercises: LOWER_A },
      {
        day: 3, name: 'Push（胸・肩・三頭）', kind: 'push', exercises: [
          ex('chest_press2', 'incline_dumbbell_press', 'chest', 60, 'chest_press'),
          ex('shoulder_press2', 'overhead_press', 'shoulders', 60, 'shoulder_press'),
          ex('chest_fly', 'cable_fly', 'chest', 60, 'chest_fly'),
          ex('shoulder_side2', 'cable_side_raise', 'shoulders', 75, 'shoulder_lateral_cable'),
          ex('triceps1', 'triceps_pushdown', 'triceps', 75, 'triceps', 'triceps'),
          ex('triceps2', 'triceps_overhead_extension', 'triceps', 90, 'triceps_2', 'triceps'),
        ],
      },
      {
        day: 4, name: 'Pull（背中・後部肩・二頭）', kind: 'pull', exercises: [
          ex('back_vertical_pull2', 'pull_up', 'back', 60, 'back_vertical_pull_alt'),
          ex('back_horizontal_pull2', 'one_hand_row', 'back', 60, 'back_horizontal_pull_heavy'),
          ex('shoulder_rear', 'face_pull', 'shoulders', 60, 'shoulder_rear_delt', 'shoulder_rear'),
          ex('back_pullover', 'straight_arm_pulldown', 'back', 75, 'back_vertical_pull'),
          ex('biceps1', 'incline_dumbbell_curl', 'biceps', 75, 'biceps', 'biceps'),
          ex('biceps2', 'hammer_curl', 'biceps', 90, 'biceps_2', 'biceps'),
        ],
      },
      {
        day: 5, name: 'Legs（ハム・四頭・カーフ・腹筋）', kind: 'legs', exercises: [
          ex('deadlift', 'deadlift', 'legs', 60, 'leg_hinge'),
          ex('squat2', 'leg_press', 'legs', 60, 'leg_2'),
          ex('core2', 'cable_crunch', 'core', 60, 'core_alt'),
          ex('calf2', 'standing_calf_raise', 'legs', 75, 'calves_standing', 'calf'),
          ex('leg_extension', 'leg_extension', 'legs', 90, 'leg_curl'),
        ],
      },
    ],
  },
  6: { daysPerWeek: 6, name: 'Push / Pull / Legs × 2', days: PPL_X2 },
  7: {
    daysPerWeek: 7,
    name: 'Push / Pull / Legs × 2 ＋ リカバリー',
    days: [
      ...PPL_X2,
      {
        // リカバリーの日（体幹・カーフ・腕のパンプ）。押す・引く種目が無くても腕を入れる（テンプレートの指定）。
        // 三頭はテンプレートではケーブルキックバックだが、ケーブルトライセプスエクステンションを使う（2026-10-24 オーナー指示）。
        // 重点部位の差し替えの対象外。努力度は他の日より1段軽くする（RIR +1）
        day: 7, name: 'Active Recovery（体幹・カーフ・腕パンプ）', kind: 'recovery', exercises: [
          ex('core', 'hanging_leg_raise', 'core', 60, 'core'),
          ex('calf', 'seated_calf_raise', 'legs', 60, 'calves_seated'),
          ex('biceps', 'cable_curl', 'biceps', 75, 'biceps'),
          ex('triceps', 'cable_triceps_extension', 'triceps', 75, 'triceps_2'),
        ],
      },
    ],
  },
}

// ── 初心者向け（週2・3日、性別に関係なく使う） ──
const BEGINNER_A: TemplateDay = {
  day: 1, name: 'Beginner Full A（マシン胸・脚・背中・腕）', kind: 'full', exercises: [
    ex('chest_press', 'chest_press_machine', 'chest', 60, 'chest_press', undefined, true),
    ex('squat', 'leg_press', 'legs', 60, 'leg_2'),
    ex('back_horizontal_pull', 'seated_cable_row', 'back', 60, 'back_horizontal_pull'),
    ex('triceps', 'triceps_pushdown', 'triceps', 75, 'triceps', 'triceps'),
    ex('core', 'ab_roller', 'core', 60, 'core'),
  ],
}
const BEGINNER_B: TemplateDay = {
  day: 2, name: 'Beginner Full B（肩・尻・背中上部・腹）', kind: 'full', exercises: [
    ex('shoulder_press', 'machine_shoulder_press', 'shoulders', 60, 'shoulder_press', undefined, true),
    ex('hip_hinge', 'dumbbell_romanian_deadlift', 'legs', 60, 'hamstring_glute', undefined, true),
    ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
    ex('biceps', 'dumbbell_curl', 'biceps', 75, 'biceps', 'biceps'),
    ex('calf', 'seated_calf_raise', 'legs', 90, 'calves_seated', 'calf'),
  ],
}
const BEGINNER_C: TemplateDay = {
  day: 3, name: 'Beginner Full C（ゴブレット・胸フライ・背中・肩）', kind: 'full', exercises: [
    ex('squat2', 'goblet_squat', 'legs', 60, 'leg_2', undefined, true),
    ex('chest_fly', 'pec_deck_fly', 'chest', 60, 'chest_isolation'),
    ex('back_vertical_pull2', 'assisted_pull_up', 'back', 60, 'back_vertical_pull'),
    ex('shoulder_side', 'side_raise', 'shoulders', 75, 'shoulder_lateral'),
    plank('core2', 60),
  ],
}

export const BEGINNER_TEMPLATES: Record<number, BaseTemplate> = {
  2: { daysPerWeek: 2, name: '初心者 全身 A / B', days: [BEGINNER_A, BEGINNER_B] },
  3: { daysPerWeek: 3, name: '初心者 全身 A / B / C', days: [BEGINNER_A, BEGINNER_B, BEGINNER_C] },
}

// ── 女性向け（中級者以上、週2〜4日） ──
export const WOMEN_TEMPLATES: Record<number, BaseTemplate> = {
  2: {
    daysPerWeek: 2,
    name: '女性向け 下半身フォーカス A / B',
    days: [
      {
        day: 1, name: 'Lower Focus A（ヒップ・背中・肩・腹）', kind: 'full', exercises: [
          ex('hip_hinge', 'hip_thrust', 'legs', 60, 'hamstring_glute', undefined, true),
          ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
          ex('leg_single', 'bulgarian_split_squat', 'legs', 60, 'quad_glute_secondary'),
          ex('shoulder_press', 'dumbbell_shoulder_press', 'shoulders', 75, 'shoulder_press_2', undefined, false),
          plank('core', 60),
        ],
      },
      {
        day: 2, name: 'Lower Focus B（裏モモ・上部胸・中殿筋・腹）', kind: 'full', exercises: [
          ex('hip_hinge2', 'romanian_deadlift', 'legs', 60, 'hamstring_glute', undefined, true),
          ex('chest_press', 'incline_dumbbell_press', 'chest', 60, 'chest_press'),
          ex('back_horizontal_pull', 'seated_cable_row', 'back', 60, 'back_horizontal_pull'),
          ex('hip_abduction', 'hip_abduction', 'legs', 75, 'hip_abduction'),
          ex('core2', 'cable_crunch', 'core', 60, 'core_alt'),
        ],
      },
    ],
  },
  3: {
    daysPerWeek: 3,
    name: '女性向け お尻・上半身・前モモ',
    days: [
      {
        day: 1, name: 'Glute & Hamstrings（お尻・裏モモメイン）', kind: 'legs', exercises: [
          ex('hip_hinge', 'hip_thrust', 'legs', 60, 'hamstring_glute', undefined, true),
          ex('hip_hinge2', 'romanian_deadlift', 'legs', 60, 'hamstring_glute', undefined, false),
          ex('leg_curl', 'leg_curl', 'legs', 60, 'leg_curl'),
          ex('hip_abduction', 'hip_abduction', 'legs', 75, 'hip_abduction'),
          plank('core', 60),
        ],
      },
      {
        day: 2, name: 'Upper Body（背中・肩・バストアップ）', kind: 'upper', exercises: [
          ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
          ex('chest_press', 'incline_dumbbell_press', 'chest', 60, 'chest_press'),
          ex('shoulder_press', 'dumbbell_shoulder_press', 'shoulders', 60, 'shoulder_press_2', undefined, false),
          ex('back_horizontal_pull', 'seated_cable_row', 'back', 75, 'back_horizontal_pull'),
          ex('shoulder_side', 'cable_side_raise', 'shoulders', 75, 'shoulder_lateral_cable'),
          ex('triceps', 'triceps_pushdown', 'triceps', 90, 'triceps', 'triceps'),
        ],
      },
      {
        day: 3, name: 'Quads & Glutes（前モモ・お尻メイン）', kind: 'legs', exercises: [
          ex('squat', 'bulgarian_split_squat', 'legs', 60, 'quad_glute_secondary', undefined, true),
          ex('squat2', 'leg_press', 'legs', 60, 'quad_glute_secondary', undefined, false),
          ex('leg_extension', 'leg_extension', 'legs', 60, 'leg_curl'),
          ex('hip_hinge3', 'dumbbell_hip_thrust', 'legs', 75, 'hamstring_glute_alt'),
          ex('core2', 'cable_crunch', 'core', 60, 'core_alt'),
        ],
      },
    ],
  },
  4: {
    daysPerWeek: 4,
    name: '女性向け Upper / Lower × 2',
    days: [
      {
        day: 1, name: 'Upper A（背中・肩メイン）', kind: 'upper', exercises: [
          ex('back_vertical_pull', 'lat_pulldown', 'back', 60, 'back_vertical_pull'),
          ex('shoulder_press', 'dumbbell_shoulder_press', 'shoulders', 60, 'shoulder_press', undefined, true),
          ex('back_horizontal_pull', 'seated_cable_row', 'back', 60, 'back_horizontal_pull'),
          ex('shoulder_side', 'side_raise', 'shoulders', 75, 'shoulder_lateral'),
          ex('triceps', 'triceps_pushdown', 'triceps', 75, 'triceps', 'triceps'),
        ],
      },
      {
        day: 2, name: 'Lower A（お尻・裏モモ）', kind: 'lower', exercises: [
          ex('hip_hinge', 'hip_thrust', 'legs', 60, 'hamstring_glute', undefined, true),
          ex('hip_hinge2', 'romanian_deadlift', 'legs', 60, 'hamstring_glute', undefined, false),
          ex('leg_curl', 'leg_curl', 'legs', 75, 'leg_curl'),
          ex('hip_abduction', 'hip_abduction', 'legs', 75, 'hip_abduction'),
          plank('core', 60),
        ],
      },
      {
        day: 3, name: 'Upper B（バストアップ・背中）', kind: 'upper', exercises: [
          ex('chest_press', 'incline_dumbbell_press', 'chest', 60, 'chest_press'),
          ex('back_vertical_pull2', 'assisted_pull_up', 'back', 60, 'back_vertical_pull'),
          ex('shoulder_side2', 'cable_side_raise', 'shoulders', 75, 'shoulder_lateral_cable'),
          ex('back_pullover', 'straight_arm_pulldown', 'back', 75, 'back_vertical_pull'),
          ex('biceps', 'dumbbell_curl', 'biceps', 90, 'biceps', 'biceps'),
        ],
      },
      {
        day: 4, name: 'Lower B（お尻・前モモ）', kind: 'lower', exercises: [
          ex('squat', 'bulgarian_split_squat', 'legs', 60, 'quad_glute_secondary', undefined, true),
          ex('squat2', 'leg_press', 'legs', 60, 'quad_glute_secondary', undefined, false),
          ex('leg_extension', 'leg_extension', 'legs', 75, 'leg_curl'),
          ex('core2', 'cable_crunch', 'core', 60, 'core_alt'),
        ],
      },
    ],
  },
}

// ── プログラムの種類の選び方 ──
export type ProgramGender = 'male' | 'female'
export type ProgramLevel = 'beginner' | 'intermediate'
export type ProgramType = 'standard' | 'beginner' | 'women'

export const TEMPLATE_SETS: Record<ProgramType, Record<number, BaseTemplate>> = {
  standard: BASE_TEMPLATES,
  beginner: BEGINNER_TEMPLATES,
  women: WOMEN_TEMPLATES,
}

/** 初心者を選んだら性別に関係なく初心者向け、それ以外は女性向け／通常（2026-10-25 オーナー決定） */
export function resolveProgramType(gender: ProgramGender, level: ProgramLevel): ProgramType {
  if (level === 'beginner') return 'beginner'
  return gender === 'female' ? 'women' : 'standard'
}

/** その種類で選べる週の日数（テンプレートがある日数だけ） */
export function availableDays(type: ProgramType): number[] {
  return Object.keys(TEMPLATE_SETS[type]).map(Number).sort((a, b) => a - b)
}

// ── 改定ルール③：重点部位の差し替え（2026-10-24 オーナー決定） ──
// 対象の日にある「奪う枠」を、重点部位の種目に置き換える。全身の日（週2・3日）はどの部位でも対象。
// takes は先頭から順に探す（肩は三頭 → 二頭）。差し替えた種目と重点部位の既存の種目は、
// 〜60分でも残す（minMinutes = 60）。
export type PrioritySwap = {
  kinds: DayKind[]
  takes: SwapRole[]
  /** 差し替え後の種目の候補（先頭から、その週のプログラム全体にまだ無い種目を使う）。Day の主役で選び分ける場合（脚）は day を見る */
  replacement: (day: TemplateDay) => Omit<TemplateExercise, 'minMinutes' | 'role'>[]
}

const has = (day: TemplateDay, code: string) => day.exercises.some(e => e.code === code)

export const PRIORITY_SWAPS: Record<PriorityMuscleOption, PrioritySwap> = {
  chest: {
    kinds: ['upper', 'push', 'full'], takes: ['triceps'],
    replacement: () => [
      { slot: 'chest_fly', code: 'pec_deck_fly', muscle: 'chest', params: 'chest_isolation' },
      { slot: 'chest_fly', code: 'dumbbell_fly', muscle: 'chest', params: 'chest_isolation' },
      { slot: 'chest_fly', code: 'one_hand_cable_fly', muscle: 'chest', params: 'chest_isolation' },
      { slot: 'chest_fly', code: 'cable_crossover', muscle: 'chest', params: 'chest_isolation' },
    ],
  },
  back: {
    // ケーブルプルオーバーはマスタに無いため、同じ動き（腕を伸ばしたまま引き下ろす）のストレートアームプルダウン
    kinds: ['upper', 'pull', 'full'], takes: ['biceps'],
    replacement: () => [
      { slot: 'back_pullover', code: 'straight_arm_pulldown', muscle: 'back', params: 'back_vertical_pull' },
      { slot: 'back_row', code: 'seated_cable_row', muscle: 'back', params: 'back_horizontal_pull' },
      { slot: 'back_row', code: 'dumbbell_row', muscle: 'back', params: 'back_horizontal_pull' },
      { slot: 'back_row', code: 't_bar_row', muscle: 'back', params: 'back_horizontal_pull' },
    ],
  },
  shoulders: {
    // 前部は押す種目で十分使うため、側部を足す
    kinds: ['upper', 'full'], takes: ['triceps', 'biceps'],
    replacement: () => [
      { slot: 'shoulder_side', code: 'side_raise', muscle: 'shoulders', params: 'shoulder_lateral' },
      { slot: 'shoulder_side', code: 'cable_side_raise', muscle: 'shoulders', params: 'shoulder_lateral_cable' },
      { slot: 'shoulder_side', code: 'incline_side_raise', muscle: 'shoulders', params: 'shoulder_lateral' },
    ],
  },
  biceps: {
    kinds: ['upper', 'pull', 'full'], takes: ['shoulder_rear'],
    replacement: () => [
      { slot: 'biceps_2', code: 'hammer_curl', muscle: 'biceps', params: 'biceps_2' },
      { slot: 'biceps_2', code: 'cable_curl', muscle: 'biceps', params: 'biceps_2' },
      { slot: 'biceps_2', code: 'preacher_curl', muscle: 'biceps', params: 'biceps_2' },
      { slot: 'biceps_2', code: 'bayesian_curl', muscle: 'biceps', params: 'biceps_2' },
    ],
  },
  triceps: {
    kinds: ['upper', 'push', 'full'], takes: ['shoulder_rear'],
    replacement: () => [
      { slot: 'triceps_2', code: 'cable_triceps_extension', muscle: 'triceps', params: 'triceps_2' },
      { slot: 'triceps_2', code: 'skull_crusher', muscle: 'triceps', params: 'triceps_2' },
      { slot: 'triceps_2', code: 'cable_overhead_extension', muscle: 'triceps', params: 'triceps_2' },
      { slot: 'triceps_2', code: 'cable_kickback', muscle: 'triceps', params: 'triceps_2' },
    ],
  },
  legs: {
    // デッドリフトが主役の日は前モモ（レッグエクステンション）、それ以外は裏モモ（レッグカール）を先に
    kinds: ['lower', 'legs', 'full'], takes: ['calf'],
    replacement: day => {
      const ext = { slot: 'leg_isolation', code: 'leg_extension', muscle: 'legs' as const, params: 'leg_curl' }
      const curl = { slot: 'leg_isolation', code: 'leg_curl', muscle: 'legs' as const, params: 'leg_curl' }
      const seated = { slot: 'leg_isolation', code: 'seated_leg_curl', muscle: 'legs' as const, params: 'leg_curl' }
      return has(day, 'deadlift') ? [ext, curl, seated] : [curl, ext, seated]
    },
  },
  core: {
    kinds: ['lower', 'legs', 'full'], takes: ['calf'],
    replacement: () => [
      { slot: 'core_2', code: 'cable_crunch', muscle: 'core', params: 'core_2' },
      { slot: 'core_2', code: 'hanging_leg_raise', muscle: 'core', params: 'core_2' },
      { slot: 'core_2', code: 'leg_raise', muscle: 'core', params: 'core_2' },
      { slot: 'core_2', code: 'crunch', muscle: 'core', params: 'core_2' },
    ],
  },
}

/**
 * テンプレートに重点部位と時間を当てはめて、各 Day の種目を決める。
 * 1. 差し替え（選んだ順。同じ枠は2回差し替えない。もう一方の重点部位の種目は奪わない）
 * 2. 重点部位の既存の種目と差し替えた種目は 60 分コースから含める
 * 3. 時間で絞る（minMinutes が選んだ時間以下の種目だけ残す）
 * 体幹はその日の最後に並べる（改定ルール①）。
 */
export function applyTemplate(
  template: BaseTemplate,
  minutes: SessionMinutes,
  priorities: readonly PriorityMuscleOption[],
): TemplateDay[] {
  const protectedMuscles = new Set<TemplateMuscle>(priorities as TemplateMuscle[])
  type Item = TemplateExercise & { swapped?: boolean }
  const lists: Item[][] = template.days.map(day => day.exercises.map(e => ({ ...e })))
  // 出来上がるプログラムに残る種目か（時間で絞った後。重点部位の種目と差し替えた種目は〜60分でも残る）
  const kept = (e: Item) => e.swapped || protectedMuscles.has(e.muscle) || e.minMinutes <= minutes
  // その週のプログラム全体に入っている種目（差し替え後の種目は、週のどこにも無い種目から選ぶ。2026-10-25 オーナー決定）
  const weekCodes = () => new Set(lists.flatMap(list => list.filter(kept).map(e => e.code)))

  for (const p of priorities) {
    const rule = PRIORITY_SWAPS[p]
    template.days.forEach((day, d) => {
      if (!rule.kinds.includes(day.kind)) return
      const list = lists[d]
      for (const role of rule.takes) {
        // もう一方の重点部位の種目は奪わない。ただし自分の部位の枠（脚を選んだ時のふくらはぎ）は使ってよい
        const idx = list.findIndex(e => e.role === role && !e.swapped && (e.muscle === p || !protectedMuscles.has(e.muscle)))
        if (idx < 0) continue
        const used = weekCodes()
        const pick = rule.replacement({ ...day, exercises: list }).find(r => !used.has(r.code))
        if (!pick) continue
        list[idx] = { ...pick, minMinutes: 60, swapped: true }
        break
      }
    })
  }

  return template.days.map((day, d) => {
    const out = lists[d]
      .map(e => (protectedMuscles.has(e.muscle) || e.swapped ? { ...e, minMinutes: 60 as const } : e))
      .filter(e => e.minMinutes <= minutes)
      .map(({ swapped: _swapped, ...e }) => e)
    return { ...day, exercises: [...out.filter(e => e.muscle !== 'core'), ...out.filter(e => e.muscle === 'core')] }
  })
}
