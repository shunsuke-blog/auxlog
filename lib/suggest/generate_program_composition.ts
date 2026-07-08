// 新方式プログラム構成のアルゴリズム本体。
// 設計根拠: .company/engineering/docs/program-composition-redesign-brainstorm.md
//
// 核心ルール（同ドキュメント #8）:
// - 種目数 = f(日数のみ)。セッション時間は種目数に影響しない。
// - セット数（6パターン以外）= f(セッション時間のみ)。日数はセット数に影響しない。
// - 6パターンのセット数はこの式の対象外。既存の週次漸進システム（program_engine.ts）が担当する。

import type { TargetMuscle } from '@/types'
import {
  BASE_CATEGORIES_BY_RANK,
  LEG_DEFAULT_CATEGORY,
  MUSCLE_CAPS,
  PRIORITY_CATEGORY_MAP,
  type CompositionCategory,
  type PriorityMuscleOption,
} from '@/lib/constants/program_composition'

export type DaysPerWeek = 2 | 3 | 4
export type SessionDurationMinutes = 60 | 75 | 90

type RankedCategory = { rank: number; category: CompositionCategory }

/**
 * priority枠（canonical順位10・11）の中身を決める。
 * - 2つ選択: 10=priority1, 11=priority2（それぞれのカテゴリを使い、対応するcanonical順位をスキップ）
 * - 1つ選択: 10=priority1、11=脚デフォルト（スキップなし）
 * - 0選択: 10=脚デフォルト、11=省略（後続から借りてこない。brainstorm #12で#5の繰り上げ案を上書き）
 */
function resolvePrioritySlots(priorities: readonly PriorityMuscleOption[]): {
  slot10: CompositionCategory
  slot11: CompositionCategory | null
  skipRanks: ReadonlySet<number>
} {
  const [p1, p2] = priorities
  const skipRanks = new Set<number>()

  if (p1 == null) {
    return { slot10: LEG_DEFAULT_CATEGORY, slot11: null, skipRanks }
  }

  const slot10 = PRIORITY_CATEGORY_MAP[p1].category
  skipRanks.add(PRIORITY_CATEGORY_MAP[p1].skipRank)

  if (p2 == null) {
    return { slot10, slot11: LEG_DEFAULT_CATEGORY, skipRanks }
  }

  const slot11 = PRIORITY_CATEGORY_MAP[p2].category
  skipRanks.add(PRIORITY_CATEGORY_MAP[p2].skipRank)
  return { slot10, slot11, skipRanks }
}

/** canonical順位1-24の完全なシーケンスを、priority枠の中身とスキップを反映して組み立てる。 */
function buildFullSequence(priorities: readonly PriorityMuscleOption[]): RankedCategory[] {
  const { slot10, slot11, skipRanks } = resolvePrioritySlots(priorities)

  const sequence: RankedCategory[] = []
  for (let rank = 1; rank <= 24; rank++) {
    if (rank === 10) {
      sequence.push({ rank, category: slot10 })
      continue
    }
    if (rank === 11) {
      if (slot11 != null) sequence.push({ rank, category: slot11 })
      continue
    }
    if (skipRanks.has(rank)) continue
    const category = BASE_CATEGORIES_BY_RANK.get(rank)
    if (category == null) continue
    sequence.push({ rank, category })
  }
  return sequence
}

/**
 * 部位ごとの上限（脚5・それ以外4、腕は二頭+三頭合算で4）を適用し、
 * 上限を超えるカテゴリをcanonical順位の早い者勝ちで除外する（brainstorm #18）。
 */
function applyMuscleCaps(sequence: readonly RankedCategory[]): RankedCategory[] {
  const counts = new Map<TargetMuscle, number>()
  const result: RankedCategory[] = []
  for (const item of sequence) {
    const cap = MUSCLE_CAPS[item.category.muscle]
    const current = counts.get(item.category.muscle) ?? 0
    if (current >= cap) continue
    counts.set(item.category.muscle, current + 1)
    result.push(item)
  }
  return result
}

/**
 * 日数境界のcanonical順位カットオフ（brainstorm #12）。範囲外からは借りてこない。
 * priority2が選ばれた場合のみ、2日の基準10に+1される（10→11）。
 */
function dayCountCutoffRank(days: DaysPerWeek, priorityCount: number): number {
  if (days === 2) return priorityCount >= 2 ? 11 : 10
  if (days === 3) return 18
  return 24
}

/**
 * 日数×priority選択から、その週に含める種目カテゴリの一覧を返す。
 * セッション時間はここでは使わない（種目数には影響しないため）。
 */
export function buildExerciseCategories(
  days: DaysPerWeek,
  priorities: readonly PriorityMuscleOption[],
): CompositionCategory[] {
  const full = buildFullSequence(priorities)
  const capped = applyMuscleCaps(full)
  const cutoff = dayCountCutoffRank(days, priorities.length)
  return capped.filter(item => item.rank <= cutoff).map(item => item.category)
}

/**
 * 6パターン以外のカテゴリのセット数（brainstorm #8）。
 * 6パターン該当カテゴリのセット数はこの関数の対象外（program_engine.tsの週次漸進が担当）。
 */
export function setsForNonPatternCategory(minutes: SessionDurationMinutes): 2 | 3 {
  return minutes === 60 ? 2 : 3
}

// ── Day配分（brainstorm #13・#14: Full Body A/B・Push/Pull/Legs・Upper/Lower、腕は均等化のため全日候補） ──

const UPPER_MUSCLES: readonly TargetMuscle[] = ['chest', 'shoulders', 'back']
const LOWER_MUSCLES: readonly TargetMuscle[] = ['legs', 'core']

/** そのカテゴリを配置してよい日番号の候補を返す（優先順位はつけない）。 */
function eligibleDays(days: DaysPerWeek, category: CompositionCategory): number[] {
  if (category.muscle === 'arms') {
    // 腕は均等化のためどの日にも配置してよい（brainstorm #11・#14で確立した戦略の一般化）
    return Array.from({ length: days }, (_, i) => i + 1)
  }

  if (days === 2) {
    // Full Body A(1)/B(2)
    if (category.isSixPattern) {
      const dayForPattern: Partial<Record<string, number>> = {
        horizontal_press: 1, vertical_pull: 1, squat: 1,
        vertical_press: 2, horizontal_pull: 2, hip_hinge: 2,
      }
      const d = dayForPattern[category.movementPattern ?? '']
      return d != null ? [d] : [1, 2]
    }
    return [1, 2]
  }

  if (days === 3) {
    // Push(1)/Pull(2)/Legs(3)
    if (category.isSixPattern) {
      const dayForPattern: Partial<Record<string, number>> = {
        horizontal_press: 1, vertical_press: 1,
        horizontal_pull: 2, vertical_pull: 2,
        squat: 3, hip_hinge: 3,
      }
      const d = dayForPattern[category.movementPattern ?? '']
      return d != null ? [d] : [1, 2, 3]
    }
    if (category.muscle === 'chest' || category.muscle === 'shoulders') return [1]
    if (category.muscle === 'back') return [2]
    return [3] // legs, core
  }

  // days === 4: Upper(1,3)/Lower(2,4)
  if (UPPER_MUSCLES.includes(category.muscle)) return [1, 3]
  if (LOWER_MUSCLES.includes(category.muscle)) return [2, 4]
  return [1, 2, 3, 4]
}

/**
 * 種目カテゴリ一覧を、貪欲法（残っている候補日のうちその時点で一番種目数が少ない日を選ぶ）で
 * 日別に配分する。既存の generateDaySlotIds と同じ考え方（generate_program_slots.ts）。
 */
export function distributeToDays(
  days: DaysPerWeek,
  categories: readonly CompositionCategory[],
): Map<number, CompositionCategory[]> {
  const dayCounts = new Map<number, number>()
  const result = new Map<number, CompositionCategory[]>()
  for (let d = 1; d <= days; d++) {
    dayCounts.set(d, 0)
    result.set(d, [])
  }

  for (const category of categories) {
    const candidates = eligibleDays(days, category)
      .slice()
      .sort((a, b) => dayCounts.get(a)! - dayCounts.get(b)!)
    const day = candidates[0]
    dayCounts.set(day, dayCounts.get(day)! + 1)
    result.get(day)!.push(category)
  }

  return result
}

// 週2日の全身法だと1回のセッションに重いトップセット（1RM%ベース）が集中しすぎる
// （旧HAS_ONE_RM_FREQ2_DEMOTIONS、program_slots.tsから移植）ため、週2日のときだけ
// shoulder_press・leg_default・leg_2を「本気を出さないアクセサリー種目」に格下げする。
const HAS_ONE_RM_DAYS2_DEMOTIONS = new Set(['shoulder_press', 'leg_default', 'leg_2'])

/**
 * 週2日のとき、このカテゴリは（実際に選ばれた種目がrequires_one_rmでも）1RM管理を
 * 強制的に格下げする対象かどうか。1RM管理の主判定は種目ごとのUserExercise.requires_one_rm
 * （program_engine.ts参照、2026-07-08修正: カテゴリ単位のhasOneRmだけでは、同じ動きパターン内で
 * 1RM管理する種目としない種目が混在するケースを誤判定していたため、種目単位の判定に変更した）。
 */
export function isOneRmDemotedAtDays(category: CompositionCategory, days: DaysPerWeek): boolean {
  return days === 2 && HAS_ONE_RM_DAYS2_DEMOTIONS.has(category.id)
}

/**
 * そのカテゴリの拮抗筋スーパーセット相手を、同日に配置されているカテゴリの中から1つ探す。
 * 同じsupersetPairGroupを持ち、movementPatternが異なるカテゴリのみを相手候補にする。
 */
export function findSupersetPartnerCategory(
  category: CompositionCategory,
  sameDayCategories: readonly CompositionCategory[],
): CompositionCategory | undefined {
  if (!category.supersetPairGroup) return undefined
  return sameDayCategories.find(
    other => other.id !== category.id
      && other.supersetPairGroup === category.supersetPairGroup
      && other.movementPattern !== category.movementPattern,
  )
}
