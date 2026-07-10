// プログラム構成の新方式（種目数=f(日数)、セット数=f(セッション時間)）のカテゴリ定義。
// 設計の経緯・各ルールの根拠は .company/engineering/docs/program-composition-redesign-brainstorm.md
// を参照（このファイルはその設計に基づく実装）。
//
// 2026-07-08、旧lib/constants/program_slots.ts（tier=スロット単位の方式）から完全移行し、
// 旧ファイル・generate_program_slots.tsは削除済み。

import type { TargetMuscle, PriorityMuscleOption } from '@/types'

// PriorityMuscleOptionの定義本体は types/index.ts にある（UserProgramEnrollment.priority_muscles
// の型と共有するため）。ここでは再エクスポートのみ行う。
export type { PriorityMuscleOption }

// exercise_master.movement_pattern列のCHECK制約と一致させる（旧lib/constants/program_slots.ts
// から移植、2026-07-08）。hip_adduction_abduction・knee_flexionは新方式のカテゴリ定義では
// 使わないが、既存DBデータの型互換のため列挙に残す。
export type MovementPattern =
  | 'horizontal_press'
  | 'vertical_press'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hip_hinge'
  | 'shoulder_horizontal_adduction'
  | 'shoulder_abduction'
  | 'shoulder_horizontal_abduction'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'ankle_plantar_flexion'
  | 'trunk_flexion'
  | 'hip_adduction_abduction'
  | 'knee_flexion'

export type CompositionCategory = {
  /** カテゴリの一意なID。同じIDは「同じ役割」を表し、重複排除・上限カウントの単位になる。 */
  id: string
  muscle: TargetMuscle
  /** 必須6動きパターンに該当するか（表示上の分類、マッチングにはmovementPatternを使う）。 */
  isSixPattern: boolean
  /** マッチング・スワップ候補の絞り込みに使う動きパターン。複数指定した場合はいずれかに
   *  一致すればよい（例: 脚2種目目はスクワット or ヒップヒンジを許容、brainstorm #10）。
   *  未指定のカテゴリは無い想定だが、その場合は部位一致にフォールバックする。 */
  movementPattern?: MovementPattern | MovementPattern[]
  label: string
  /** %RM管理の重いコンパウンドかどうか（program_engine.tsのbuildCompoundSets/buildIsolationSets分岐）。 */
  hasOneRm: boolean
  /** 拮抗筋スーパーセットのグループタグ（mesocycle-tier-progression-levers-design.md由来）。
   *  同じタグを持つカテゴリ同士がペア候補（movementPatternが異なるもの）。 */
  supersetPairGroup?: string
}

/** 部位ごとの種目数上限。脚以外は4、脚は5（brainstorm #18）。腕は二頭+三頭の合算で4。 */
export const MUSCLE_CAPS: Record<TargetMuscle, number> = {
  chest: 4,
  back: 4,
  shoulders: 4,
  arms: 4,
  legs: 5,
  core: 4,
}

// ── canonical順位1-9・12-24（priority枠10・11を除く固定部分）──
// rank番号は brainstorm #10 の表と一致させている。範囲外から借りてこない日数境界判定
// （brainstorm #12）は、このrank番号をそのまま使う。
const chestPress: CompositionCategory = { id: 'chest_press', muscle: 'chest', isSixPattern: true, movementPattern: 'horizontal_press', label: 'ホリゾンタルプレス', hasOneRm: true }
const shoulderPress: CompositionCategory = { id: 'shoulder_press', muscle: 'shoulders', isSixPattern: true, movementPattern: 'vertical_press', label: 'バーチカルプレス', hasOneRm: true }
const backRow: CompositionCategory = { id: 'back_row', muscle: 'back', isSixPattern: true, movementPattern: 'horizontal_pull', label: 'ホリゾンタルロウ', hasOneRm: false }
const backPull: CompositionCategory = { id: 'back_pull', muscle: 'back', isSixPattern: true, movementPattern: 'vertical_pull', label: 'バーチカルプル', hasOneRm: false }
const legSquat: CompositionCategory = { id: 'leg_squat', muscle: 'legs', isSixPattern: true, movementPattern: 'squat', label: 'スクワット', hasOneRm: true }
const legHinge: CompositionCategory = { id: 'leg_hinge', muscle: 'legs', isSixPattern: true, movementPattern: 'hip_hinge', label: 'ヒップヒンジ', hasOneRm: false }
const core1: CompositionCategory = { id: 'core_1', muscle: 'core', isSixPattern: false, movementPattern: 'trunk_flexion', label: '腹筋', hasOneRm: false }
const biceps1: CompositionCategory = { id: 'biceps_1', muscle: 'arms', isSixPattern: false, movementPattern: 'elbow_flexion', label: '二頭', hasOneRm: false, supersetPairGroup: 'arm_flex_ext' }
const triceps1: CompositionCategory = { id: 'triceps_1', muscle: 'arms', isSixPattern: false, movementPattern: 'elbow_extension', label: '三頭', hasOneRm: false, supersetPairGroup: 'arm_flex_ext' }

const shoulderRearDelt: CompositionCategory = { id: 'shoulder_rear_delt', muscle: 'shoulders', isSixPattern: false, movementPattern: 'shoulder_horizontal_abduction', label: '肩後部', hasOneRm: false, supersetPairGroup: 'chest_rear_delt' }
const shoulderLateral: CompositionCategory = { id: 'shoulder_lateral', muscle: 'shoulders', isSixPattern: false, movementPattern: 'shoulder_abduction', label: '肩側方', hasOneRm: false }
// ホリゾンタルロウ or バーチカルプルのどちらでもよい（brainstorm #10「背中｜ホリゾンタルロウ/バーチカルプルのいずれか」）
const back2: CompositionCategory = { id: 'back_2', muscle: 'back', isSixPattern: false, movementPattern: ['horizontal_pull', 'vertical_pull'], label: '背中2種目目', hasOneRm: false }
const chestFly: CompositionCategory = { id: 'chest_fly', muscle: 'chest', isSixPattern: false, movementPattern: 'shoulder_horizontal_adduction', label: '胸2種目目（フライ系）', hasOneRm: false, supersetPairGroup: 'chest_rear_delt' }
// スクワット or ヒップヒンジのどちらでもよい（brainstorm #10「脚2種目目（スクワット or ヒンジ）」）
const leg2: CompositionCategory = { id: 'leg_2', muscle: 'legs', isSixPattern: false, movementPattern: ['squat', 'hip_hinge'], label: '脚2種目目', hasOneRm: true }
const biceps2: CompositionCategory = { id: 'biceps_2', muscle: 'arms', isSixPattern: false, movementPattern: 'elbow_flexion', label: '二頭2種目目', hasOneRm: false, supersetPairGroup: 'arm_flex_ext' }
const triceps2: CompositionCategory = { id: 'triceps_2', muscle: 'arms', isSixPattern: false, movementPattern: 'elbow_extension', label: '三頭2種目目', hasOneRm: false, supersetPairGroup: 'arm_flex_ext' }
const core2: CompositionCategory = { id: 'core_2', muscle: 'core', isSixPattern: false, movementPattern: 'trunk_flexion', label: '腹筋2種目目', hasOneRm: false }
const shoulderPress2: CompositionCategory = { id: 'shoulder_press_2', muscle: 'shoulders', isSixPattern: false, movementPattern: 'vertical_press', label: '肩（プレス）2種目目', hasOneRm: false }
const calves: CompositionCategory = { id: 'calves', muscle: 'legs', isSixPattern: false, movementPattern: 'ankle_plantar_flexion', label: 'カーフ', hasOneRm: false }
const back3: CompositionCategory = { id: 'back_3', muscle: 'back', isSixPattern: false, movementPattern: 'horizontal_pull', label: '背中3種目目', hasOneRm: false }
const chest3: CompositionCategory = { id: 'chest_3', muscle: 'chest', isSixPattern: false, movementPattern: 'shoulder_horizontal_adduction', label: '胸3種目目', hasOneRm: false }
const leg3: CompositionCategory = { id: 'leg_3', muscle: 'legs', isSixPattern: false, movementPattern: 'hip_hinge', label: '脚3種目目', hasOneRm: true }

/** priorityが未選択のときにpriority枠へ入るデフォルト（脚の追加種目、brainstorm #4）。 */
const legDefault: CompositionCategory = { id: 'leg_default', muscle: 'legs', isSixPattern: false, movementPattern: 'squat', label: '脚デフォルト', hasOneRm: true }

/** rank => 固定カテゴリ。10・11（priority枠）は含まない。 */
export const BASE_CATEGORIES_BY_RANK: ReadonlyMap<number, CompositionCategory> = new Map([
  [1, chestPress], [2, shoulderPress], [3, backRow], [4, backPull], [5, legSquat], [6, legHinge],
  [7, core1], [8, biceps1], [9, triceps1],
  [12, shoulderRearDelt], [13, shoulderLateral], [14, back2], [15, chestFly], [16, leg2],
  [17, biceps2], [18, triceps2], [19, core2], [20, shoulderPress2], [21, calves],
  [22, back3], [23, chest3], [24, leg3],
])

export const LEG_DEFAULT_CATEGORY = legDefault

/** 存在する全カテゴリID（API入力バリデーション用、旧VALID_SLOT_IDSに相当）。 */
export const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set([
  ...BASE_CATEGORIES_BY_RANK.values(),
  legDefault,
].map(c => c.id))

/**
 * priorityに選んだ部位ごとに「priority枠で使うカテゴリ」と「重複するため
 * スキップすべきcanonical順位」の対応（brainstorm #10・#19）。
 * 肩は側方/後部のどちらも既にcanonical順位12・13に登場しているため、
 * priority側方を使う前提でskipRank=13とする（当初「スキップなし」としていたのは誤りだった）。
 */
export const PRIORITY_CATEGORY_MAP: Record<PriorityMuscleOption, { category: CompositionCategory; skipRank: number }> = {
  chest: { category: chestFly, skipRank: 15 },
  shoulders: { category: shoulderLateral, skipRank: 13 },
  back: { category: back2, skipRank: 14 },
  biceps: { category: biceps2, skipRank: 17 },
  triceps: { category: triceps2, skipRank: 18 },
  core: { category: core2, skipRank: 19 },
  legs: { category: calves, skipRank: 21 },
}
