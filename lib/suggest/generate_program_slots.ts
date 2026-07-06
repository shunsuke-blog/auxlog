// 頻度（週2/3/4回）とセッション時間（tier）から、各日にどのスロットを配置するかを
// 動的に計算する。day_numberはスロット側に持たせず、ここで都度算出する。
//
// 各動きパターンについて「配置してよい候補日の集合」だけをELIGIBLE_DAYSで決めておき
// （優先順位は決めない）、貪欲法（残っている候補日のうち、その時点で一番種目数が少ない
// 日を選ぶ）で自動的に均等配置する。同じパターン内の複数スロットは、可能な限り
// 「まだこのパターンで使っていない候補日」を優先することで同じ日への集中を避ける。
//
// 週4日（分割型）では、複合種目・単関節種目とも body_region に応じた候補日
// （upper→[1,3]、lower→[2,4]）に限定する。これにより、脚の日に肩・腕などの上半身の
// 補助種目が紛れ込む（貪欲法が種目数の少なさだけを見て部位を無視してしまう）副作用を防ぐ。
// 週2・3日はFull Bodyのため全日が候補になる。

import { PROGRAM_SLOTS, isSlotActiveForFreq, type FrequencyVariant, type MovementPattern, type ProgramSlotDef } from '@/lib/constants/program_slots'

const UPPER_DAYS_4 = [1, 3]
const LOWER_DAYS_4 = [2, 4]

const UPPER_PATTERNS: MovementPattern[] = [
  'horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull',
  'shoulder_abduction', 'shoulder_horizontal_abduction',
  'elbow_extension', 'elbow_flexion', 'shoulder_horizontal_adduction',
]
const LOWER_PATTERNS: MovementPattern[] = [
  'squat', 'hip_hinge', 'ankle_plantar_flexion', 'hip_adduction_abduction', 'trunk_flexion',
]

const ALL_PATTERNS: MovementPattern[] = [...UPPER_PATTERNS, ...LOWER_PATTERNS]

export const ELIGIBLE_DAYS: Record<FrequencyVariant, Partial<Record<MovementPattern, number[]>>> = {
  4: {
    ...Object.fromEntries(UPPER_PATTERNS.map(p => [p, UPPER_DAYS_4])),
    ...Object.fromEntries(LOWER_PATTERNS.map(p => [p, LOWER_DAYS_4])),
  },
  3: Object.fromEntries(ALL_PATTERNS.map(p => [p, [1, 2, 3]])),
  2: Object.fromEntries(ALL_PATTERNS.map(p => [p, [1, 2]])),
}

/**
 * 指定した頻度・tierに含まれるスロットを、日番号(1〜daysPerWeek)ごとに振り分ける。
 * 戻り値: Map<day_number, Set<slot_id>>
 */
export function generateDaySlotIds(daysPerWeek: FrequencyVariant, maxTier: 1 | 2 | 3): Map<number, Set<string>> {
  const included = PROGRAM_SLOTS.filter(s => isSlotActiveForFreq(s, daysPerWeek, maxTier))
  const eligible = ELIGIBLE_DAYS[daysPerWeek]

  const dayCounts = new Map<number, number>()
  for (let d = 1; d <= daysPerWeek; d++) dayCounts.set(d, 0)
  const result = new Map<number, Set<string>>()
  for (let d = 1; d <= daysPerWeek; d++) result.set(d, new Set())

  const byPattern = new Map<MovementPattern, ProgramSlotDef[]>()
  for (const slot of included) {
    if (!byPattern.has(slot.movement_pattern)) byPattern.set(slot.movement_pattern, [])
    byPattern.get(slot.movement_pattern)!.push(slot)
  }

  for (const [pattern, slots] of byPattern) {
    const days = eligible[pattern] ?? []
    if (days.length === 0) {
      // 将来ELIGIBLE_DAYSに登録し忘れたパターンのスロットが追加された場合、
      // undefinedな日への配置で静かに落ちるのを防ぎ、開発時に明示的に検知する
      throw new Error(`No eligible days for pattern: ${pattern} (freq=${daysPerWeek})`)
    }

    const usedThisPattern = new Set<number>()
    for (const slot of slots) {
      let candidates = days.filter(d => !usedThisPattern.has(d))
      if (candidates.length === 0) candidates = days // 候補日を使い切ったら再利用可
      candidates.sort((a, b) => dayCounts.get(a)! - dayCounts.get(b)!)
      const day = candidates[0]
      usedThisPattern.add(day)
      dayCounts.set(day, dayCounts.get(day)! + 1)
      result.get(day)!.add(slot.slot_id)
    }
  }

  return result
}
