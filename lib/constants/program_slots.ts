// 9週間プログラムのスロット定義。各スロットを「部位（muscle_group）」と「動きパターン
// （movement_pattern）」に紐づけ、日付（day_number）には紐づけない。日別の配置は
// lib/suggest/generate_program_slots.ts が頻度・セッション時間から動的に計算する。
//
// 背景: 旧設計は頻度（週2/3/4回）ごとに固定のday_number/priorityを持ち、セッション時間を
// 短くするとpriorityでスロットを一律カットしていた。この結果、複合6パターン（水平プレス・
// 垂直プレス・水平プル・垂直プル・スクワット・ヒップヒンジ）は全てpriority1を持つ一方、
// 単関節8パターン（胸フライ・サイドレイズ・リアデルト・二頭筋・三頭筋・カーフ・体幹・
// 股関節内外転）は全てpriority2〜3だったため、60〜75分設定では単関節種目の部位が
// 「セット数が減る」のではなく「その日から完全に消える」という欠陥があった。
//
// 新設計ではtier（旧priority、頻度非依存）を12/18/24（60/75/90分に対応）の累計で構成し、
// 日別配置はgenerateDaySlotIdsが担う。既存23スロットのslot_idは変更していない
// （user_slot_assignments/user_slot_one_rms/program_weekly_paramsのデータ移行を避けるため）。
// hip_adductionのみ股関節内外転パターンをカバーするため新規追加した24番目のスロット。
//
// hip_adduction（股関節内外転）はオーナー判断によりtier3（90分のみ）に設定している
// （優先度は低くてよいという方針）。tier1/2の枠数を保つため、squat系のquad_ham_glute
// をtier3へ、体幹のcore_altをtier1へ、それぞれ玉突きで調整した。
//
// カーフ（足関節底屈）も同様にオーナー判断で優先度を下げ、calves_seatedをtier1→tier2に
// 変更（calves_standingは元々tier2のまま）。tier1の枠を埋めるためtricepsをtier2→tier1へ
// 昇格。squat/hip_hinge系パターンがtier2以下で3スロットに重複しないよう検証済み
// （`npm test`のhas_one_rm集中チェック・日別バランスチェックを参照）。

import type { TargetMuscle } from '@/types'

export type FrequencyVariant = 2 | 3 | 4

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

export type BodyRegion = 'upper' | 'lower'

export type ProgramSlotDef = {
  slot_id: string
  label: string
  muscle_group: TargetMuscle
  body_region: BodyRegion
  movement_pattern: MovementPattern
  tier: 1 | 2 | 3
  has_one_rm: boolean
}

export const PROGRAM_SLOTS: ProgramSlotDef[] = [
  // ── 胸 ──
  { slot_id: 'chest_compound', label: '胸', muscle_group: 'chest', body_region: 'upper', movement_pattern: 'horizontal_press', tier: 1, has_one_rm: true },
  { slot_id: 'chest_triceps_compound', label: '胸・腕', muscle_group: 'chest', body_region: 'upper', movement_pattern: 'horizontal_press', tier: 1, has_one_rm: true },
  { slot_id: 'chest_isolation', label: '胸（補助）', muscle_group: 'chest', body_region: 'upper', movement_pattern: 'shoulder_horizontal_adduction', tier: 3, has_one_rm: false },

  // ── 背中 ──
  { slot_id: 'back_horizontal_pull', label: '背中', muscle_group: 'back', body_region: 'upper', movement_pattern: 'horizontal_pull', tier: 1, has_one_rm: false },
  { slot_id: 'back_vertical_pull', label: '背中', muscle_group: 'back', body_region: 'upper', movement_pattern: 'vertical_pull', tier: 1, has_one_rm: false },
  { slot_id: 'back_horizontal_pull_heavy', label: '背中', muscle_group: 'back', body_region: 'upper', movement_pattern: 'horizontal_pull', tier: 2, has_one_rm: false },
  { slot_id: 'back_vertical_pull_alt', label: '背中', muscle_group: 'back', body_region: 'upper', movement_pattern: 'vertical_pull', tier: 3, has_one_rm: false },

  // ── 肩 ──
  { slot_id: 'shoulder_vertical_press', label: '肩', muscle_group: 'shoulders', body_region: 'upper', movement_pattern: 'vertical_press', tier: 1, has_one_rm: true },
  { slot_id: 'shoulder_lateral', label: '肩', muscle_group: 'shoulders', body_region: 'upper', movement_pattern: 'shoulder_abduction', tier: 1, has_one_rm: false },
  { slot_id: 'shoulder_rear_delt', label: '肩（後部）', muscle_group: 'shoulders', body_region: 'upper', movement_pattern: 'shoulder_horizontal_abduction', tier: 2, has_one_rm: false },
  { slot_id: 'shoulder_lateral_cable', label: '肩', muscle_group: 'shoulders', body_region: 'upper', movement_pattern: 'shoulder_abduction', tier: 3, has_one_rm: false },

  // ── 腕 ──
  { slot_id: 'biceps', label: '腕', muscle_group: 'arms', body_region: 'upper', movement_pattern: 'elbow_flexion', tier: 1, has_one_rm: false },
  { slot_id: 'triceps', label: '腕', muscle_group: 'arms', body_region: 'upper', movement_pattern: 'elbow_extension', tier: 1, has_one_rm: false },
  { slot_id: 'biceps_alt', label: '腕', muscle_group: 'arms', body_region: 'upper', movement_pattern: 'elbow_flexion', tier: 3, has_one_rm: false },

  // ── 脚 ──
  { slot_id: 'quad_glute_primary', label: '脚', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'squat', tier: 1, has_one_rm: true },
  { slot_id: 'hamstring_glute', label: '脚（裏側）', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'hip_hinge', tier: 1, has_one_rm: false },
  { slot_id: 'hamstring_glute_heavy', label: '脚（裏側）', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'hip_hinge', tier: 2, has_one_rm: true },
  { slot_id: 'quad_glute_secondary', label: '脚（補助）', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'squat', tier: 2, has_one_rm: true },
  { slot_id: 'calves_seated', label: 'ふくらはぎ', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'ankle_plantar_flexion', tier: 2, has_one_rm: false },
  { slot_id: 'calves_standing', label: 'ふくらはぎ', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'ankle_plantar_flexion', tier: 2, has_one_rm: false },
  { slot_id: 'quad_ham_glute', label: '脚（補助）', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'squat', tier: 3, has_one_rm: false },
  { slot_id: 'hip_adduction', label: '脚（内外転）', muscle_group: 'legs', body_region: 'lower', movement_pattern: 'hip_adduction_abduction', tier: 3, has_one_rm: false },

  // ── 体幹 ──
  { slot_id: 'core', label: '腹筋', muscle_group: 'core', body_region: 'lower', movement_pattern: 'trunk_flexion', tier: 1, has_one_rm: false },
  { slot_id: 'core_alt', label: '腹筋', muscle_group: 'core', body_region: 'lower', movement_pattern: 'trunk_flexion', tier: 1, has_one_rm: false },
]

export const VALID_SLOT_IDS = new Set(PROGRAM_SLOTS.map(s => s.slot_id))

// 週2日の全身法だと1回のセッションに重いトップセット（1RM%ベース）が集中しすぎる
// （ベンチ・OHP・スクワット・ハイバースクワット・デッドリフトの5つ）ため、週2日のときだけ
// OHP・ハイバースクワットを「本気を出さないアクセサリー種目」に格下げする。
const HAS_ONE_RM_FREQ2_DEMOTIONS = new Set(['shoulder_vertical_press', 'quad_glute_secondary'])

export function slotHasOneRm(slot: ProgramSlotDef, freq: FrequencyVariant): boolean {
  if (freq === 2 && HAS_ONE_RM_FREQ2_DEMOTIONS.has(slot.slot_id)) return false
  return slot.has_one_rm
}

export function sessionDurationToTier(mins: 60 | 75 | 90): 1 | 2 | 3 {
  return mins === 60 ? 1 : mins === 75 ? 2 : 3
}
