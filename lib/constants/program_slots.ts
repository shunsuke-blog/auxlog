// 9週間プログラムのスロット定義。program_slots テーブルの静的なミラー。
// スロットの追加・変更はここ1箇所を直せば全画面（オンボーディング・コーチングページ・enroll API）に反映される。

export type ProgramSlotDef = {
  slot_id: string
  label: string
  day_number: 1 | 2 | 3 | 4
  priority: 1 | 2 | 3
  has_one_rm: boolean
}

export const PROGRAM_SLOTS: ProgramSlotDef[] = [
  // Day 1
  { slot_id: 'chest_compound',             label: '胸',         day_number: 1, priority: 1, has_one_rm: true  },
  { slot_id: 'back_vertical_pull',         label: '背中',       day_number: 1, priority: 1, has_one_rm: false },
  { slot_id: 'back_horizontal_pull',       label: '背中',       day_number: 1, priority: 1, has_one_rm: false },
  { slot_id: 'shoulder_lateral',           label: '肩',         day_number: 1, priority: 2, has_one_rm: false },
  { slot_id: 'shoulder_rear_delt',         label: '肩（後部）', day_number: 1, priority: 2, has_one_rm: false },
  { slot_id: 'triceps',                    label: '腕',         day_number: 1, priority: 3, has_one_rm: false },
  { slot_id: 'biceps',                     label: '腕',         day_number: 1, priority: 3, has_one_rm: false },
  // Day 2
  { slot_id: 'quad_glute_primary',         label: '脚',         day_number: 2, priority: 1, has_one_rm: true  },
  { slot_id: 'hamstring_glute',            label: '脚（裏側）', day_number: 2, priority: 1, has_one_rm: false },
  { slot_id: 'quad_ham_glute',             label: '脚（補助）', day_number: 2, priority: 2, has_one_rm: false },
  { slot_id: 'calves_seated',              label: 'ふくらはぎ', day_number: 2, priority: 2, has_one_rm: false },
  { slot_id: 'core',                       label: '腹筋',       day_number: 2, priority: 2, has_one_rm: false },
  // Day 3
  { slot_id: 'shoulder_vertical_press',    label: '肩',         day_number: 3, priority: 1, has_one_rm: true  },
  { slot_id: 'chest_triceps_compound',     label: '胸・腕',     day_number: 3, priority: 1, has_one_rm: false },
  { slot_id: 'back_horizontal_pull_heavy', label: '背中',       day_number: 3, priority: 1, has_one_rm: false },
  { slot_id: 'back_vertical_pull_alt',     label: '背中',       day_number: 3, priority: 1, has_one_rm: false },
  { slot_id: 'chest_isolation',            label: '胸（補助）', day_number: 3, priority: 2, has_one_rm: false },
  { slot_id: 'shoulder_lateral_cable',     label: '肩',         day_number: 3, priority: 2, has_one_rm: false },
  { slot_id: 'biceps_alt',                 label: '腕',         day_number: 3, priority: 3, has_one_rm: false },
  // Day 4
  { slot_id: 'hamstring_glute_heavy',      label: '脚（裏側）', day_number: 4, priority: 1, has_one_rm: true  },
  { slot_id: 'quad_glute_secondary',       label: '脚（補助）', day_number: 4, priority: 1, has_one_rm: true  },
  { slot_id: 'calves_standing',            label: 'ふくらはぎ', day_number: 4, priority: 2, has_one_rm: false },
  { slot_id: 'core_alt',                   label: '腹筋',       day_number: 4, priority: 2, has_one_rm: false },
]

export const VALID_SLOT_IDS = new Set(PROGRAM_SLOTS.map(s => s.slot_id))
