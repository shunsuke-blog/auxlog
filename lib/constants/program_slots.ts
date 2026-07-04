// 9週間プログラムのスロット定義。頻度（週2/3/4回）ごとのDay配分・優先度・1RM管理有無を
// アプリのコード側で一元管理する（DBの program_slots テーブルは変更しない）。
//
// 背景: 元の4日Upper/Lower分割を「週2/3回」に単純に切り詰めると、Day4（デッドリフト・
// ハイバースクワット）が丸ごと消えるなど、BIG3の一部が特定の頻度で選べなくなる欠陥があった。
// 週2/3回は「切り詰め」ではなく、Full Body型として全23スロットを再配分した別プログラムとして扱う。
//
// 週2回版は5つの1RM管理種目（ベンチ・スクワット・OHP・デッドリフト・ハイバースクワット）を
// 1日に収めきれないため、OHP・ハイバースクワットは1RM管理を外し、直近実績ベースの
// 補助種目（priority 2）として扱う。ベンチ・スクワット・デッドリフト（真のBIG3）のみ1RM管理を維持する。

export type FrequencyVariant = 2 | 3 | 4

type SlotVariant = {
  day_number: number
  priority: 1 | 2 | 3
  has_one_rm: boolean
}

export type ProgramSlotDef = {
  slot_id: string
  label: string
  // 4日版（オリジナル、参照元シート通り）
  day_number: 1 | 2 | 3 | 4
  priority: 1 | 2 | 3
  has_one_rm: boolean
  // 週2・3回版のDay配分・優先度・1RM管理（Full Body型に再設計したもの）
  variants: {
    2: SlotVariant
    3: SlotVariant
  }
}

export const PROGRAM_SLOTS: ProgramSlotDef[] = [
  // ── 4日版 Day 1（Upper A） ──
  { slot_id: 'chest_compound', label: '胸', day_number: 1, priority: 1, has_one_rm: true,
    variants: { 2: { day_number: 1, priority: 1, has_one_rm: true }, 3: { day_number: 1, priority: 1, has_one_rm: true } } },
  { slot_id: 'back_vertical_pull', label: '背中', day_number: 1, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 1, has_one_rm: false }, 3: { day_number: 1, priority: 1, has_one_rm: false } } },
  { slot_id: 'back_horizontal_pull', label: '背中', day_number: 1, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 1, has_one_rm: false }, 3: { day_number: 2, priority: 1, has_one_rm: false } } },
  { slot_id: 'shoulder_lateral', label: '肩', day_number: 1, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 2, has_one_rm: false }, 3: { day_number: 1, priority: 2, has_one_rm: false } } },
  { slot_id: 'shoulder_rear_delt', label: '肩（後部）', day_number: 1, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 2, priority: 2, has_one_rm: false } } },
  { slot_id: 'triceps', label: '腕', day_number: 1, priority: 3, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 3, has_one_rm: false }, 3: { day_number: 1, priority: 3, has_one_rm: false } } },
  { slot_id: 'biceps', label: '腕', day_number: 1, priority: 3, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 3, has_one_rm: false }, 3: { day_number: 2, priority: 3, has_one_rm: false } } },

  // ── 4日版 Day 2（Lower A） ──
  { slot_id: 'quad_glute_primary', label: '脚', day_number: 2, priority: 1, has_one_rm: true,
    variants: { 2: { day_number: 1, priority: 1, has_one_rm: true }, 3: { day_number: 1, priority: 1, has_one_rm: true } } },
  { slot_id: 'hamstring_glute', label: '脚（裏側）', day_number: 2, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 1, has_one_rm: false }, 3: { day_number: 1, priority: 1, has_one_rm: false } } },
  { slot_id: 'quad_ham_glute', label: '脚（補助）', day_number: 2, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 2, has_one_rm: false } } },
  { slot_id: 'calves_seated', label: 'ふくらはぎ', day_number: 2, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 2, has_one_rm: false }, 3: { day_number: 1, priority: 2, has_one_rm: false } } },
  { slot_id: 'core', label: '腹筋', day_number: 2, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 2, has_one_rm: false }, 3: { day_number: 2, priority: 2, has_one_rm: false } } },

  // ── 4日版 Day 3（Upper B） ──
  { slot_id: 'shoulder_vertical_press', label: '肩', day_number: 3, priority: 1, has_one_rm: true,
    variants: { 2: { day_number: 1, priority: 2, has_one_rm: false }, 3: { day_number: 2, priority: 1, has_one_rm: true } } },
  { slot_id: 'chest_triceps_compound', label: '胸・腕', day_number: 3, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 1, has_one_rm: false } } },
  { slot_id: 'back_horizontal_pull_heavy', label: '背中', day_number: 3, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 1, has_one_rm: false } } },
  { slot_id: 'back_vertical_pull_alt', label: '背中', day_number: 3, priority: 1, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 1, has_one_rm: false } } },
  { slot_id: 'chest_isolation', label: '胸（補助）', day_number: 3, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 2, has_one_rm: false } } },
  { slot_id: 'shoulder_lateral_cable', label: '肩', day_number: 3, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 2, has_one_rm: false } } },
  { slot_id: 'biceps_alt', label: '腕', day_number: 3, priority: 3, has_one_rm: false,
    variants: { 2: { day_number: 1, priority: 3, has_one_rm: false }, 3: { day_number: 3, priority: 3, has_one_rm: false } } },

  // ── 4日版 Day 4（Lower B） ──
  { slot_id: 'hamstring_glute_heavy', label: '脚（裏側）', day_number: 4, priority: 1, has_one_rm: true,
    variants: { 2: { day_number: 2, priority: 1, has_one_rm: true }, 3: { day_number: 2, priority: 1, has_one_rm: true } } },
  { slot_id: 'quad_glute_secondary', label: '脚（補助）', day_number: 4, priority: 1, has_one_rm: true,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 1, has_one_rm: true } } },
  { slot_id: 'calves_standing', label: 'ふくらはぎ', day_number: 4, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 2, has_one_rm: false } } },
  { slot_id: 'core_alt', label: '腹筋', day_number: 4, priority: 2, has_one_rm: false,
    variants: { 2: { day_number: 2, priority: 2, has_one_rm: false }, 3: { day_number: 3, priority: 2, has_one_rm: false } } },
]

export const VALID_SLOT_IDS = new Set(PROGRAM_SLOTS.map(s => s.slot_id))

export function slotDayNumber(slot: ProgramSlotDef, freq: FrequencyVariant): number {
  return freq === 4 ? slot.day_number : slot.variants[freq].day_number
}

export function slotPriority(slot: ProgramSlotDef, freq: FrequencyVariant): 1 | 2 | 3 {
  return freq === 4 ? slot.priority : slot.variants[freq].priority
}

export function slotHasOneRm(slot: ProgramSlotDef, freq: FrequencyVariant): boolean {
  return freq === 4 ? slot.has_one_rm : slot.variants[freq].has_one_rm
}
