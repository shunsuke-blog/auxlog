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

/** canonical順位1-25の完全なシーケンスを、priority枠の中身とスキップを反映して組み立てる。 */
function buildFullSequence(priorities: readonly PriorityMuscleOption[]): RankedCategory[] {
  const { slot10, slot11, skipRanks } = resolvePrioritySlots(priorities)

  const sequence: RankedCategory[] = []
  for (let rank = 1; rank <= 25; rank++) {
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
 * 2026-08-21、leg_curl追加でrank17以降が繰り下がったため週3日=19・週4日=25に更新
 * （既存の含有カテゴリ数はそのまま、レッグカール1件だけが純増する）。
 */
function dayCountCutoffRank(days: DaysPerWeek, priorityCount: number): number {
  if (days === 2) return priorityCount >= 2 ? 11 : 10
  if (days === 3) return 19
  return 25
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
 * 2026-08-21修正: 75分と90分が同一セット数になり90分利用者への追加価値が無かったため、
 * 60/75/90分で3段階に分離（REVIEW_POLICY.md既知課題#1）。
 */
export function setsForNonPatternCategory(minutes: SessionDurationMinutes): 2 | 3 | 4 {
  if (minutes === 60) return 2
  if (minutes === 75) return 3
  return 4
}

// 6パターン・1RM管理カテゴリ（chest_press等）のセット数は週次固定値（movement_pattern_weekly_
// paramsのbackoff_sets）で決まり、setsForNonPatternCategoryの対象外のためセッション時間に
// 連動しない。通常は同じ部位に非6パターンのアクセサリー種目（例: chest_fly）が別途あり、
// そちらが時間でスケールするため部位全体としては時間に応じてボリュームが増える。
// しかし週2日はカテゴリ数が少なく、部位によっては6パターン種目しか無く（例: 胸=chest_pressのみ）、
// アクセサリーによる時間スケールが一切効かない部位が生まれる（実装依頼書 要件1、2026-08-27。
// 60/75/90分すべてで胸が同じセット数になるバグ）。
// 「その部位に非6パターンのカテゴリが1つも無い」場合だけ、6パターン種目のバックオフセット数に
// 時間ボーナスを加える一般化で解消する（部位を決め打ちしない）。

/**
 * 日数×priority選択の構成の中で、6パターン（isSixPattern）のカテゴリしか無い
 * ＝非6パターンのアクセサリーによる時間スケールが一切効かない部位の集合を返す。
 * 週4日は全部位に必ずアクセサリーがあるため常に空集合になり、既存の週4日の出力は
 * 変化しない（回帰テストで担保）。
 */
export function musclesNeedingSixPatternDurationBonus(
  days: DaysPerWeek,
  priorities: readonly PriorityMuscleOption[],
): ReadonlySet<TargetMuscle> {
  const categories = buildExerciseCategories(days, priorities)
  const musclesWithAccessory = new Set(categories.filter(c => !c.isSixPattern).map(c => c.muscle))
  const sixPatternMuscles = new Set(categories.filter(c => c.isSixPattern).map(c => c.muscle))
  return new Set([...sixPatternMuscles].filter(m => !musclesWithAccessory.has(m)))
}

/**
 * 上記のmusclesNeedingSixPatternDurationBonusに該当する部位の6パターン種目に加える、
 * セッション時間に応じたバックオフセット数のボーナス。setsForNonPatternCategoryと同じ
 * 60/75/90分の3段階の刻み幅（+0/+1/+2）に揃える。
 */
export function sixPatternDurationBonusSets(minutes: SessionDurationMinutes): 0 | 1 | 2 {
  if (minutes === 60) return 0
  if (minutes === 75) return 1
  return 2
}

// ── Day配分（brainstorm #13・#14: Full Body A/B・Push/Pull/Legs・Upper/Lower、腕は均等化のため全日候補） ──

const UPPER_MUSCLES: readonly TargetMuscle[] = ['chest', 'shoulders', 'back']
const LOWER_MUSCLES: readonly TargetMuscle[] = ['legs', 'core']

// 週3日フルボディ化（実装依頼書 要件2、2026-08-27）: 旧実装は実質Push/Pull/Legs
// （各筋1回/週）で、高時間ティアで1筋のボリュームが1セッションに集中していた
// （例: 週3日90分でDay3に脚16セット等）。動きパターン単位の抽象ルールでは
// 「主要筋（胸・背中・脚）をなるべく週2回に近づける」配置を表現しづらいため、
// カテゴリID単位で配置日を明示指定する方式に変更した。種目自体・総カテゴリ数は
// 変えず、配置日だけを変更（総ボリュームは維持）。
//
// 配置の設計意図:
// - 胸(chest_press/chest_fly)・背中(back_row/back_pull/back_2)・脚(leg_squat/leg_hinge/
//   leg_default/leg_2/leg_curl)を、それぞれ2〜3日に分散させ、週2回以上の頻度にする。
// - 脚は種目数が多い(5)ため、1日に集中しないよう3日に分けている（1セッションあたりの
//   過度な集中を避ける）。
// - 拮抗筋スーパーセット候補（chest_fly×shoulder_rear_delt、biceps×triceps）は
//   ペアが同日に来るよう配慮（day2にchest_fly+shoulder_rear_delt、day1と day3に
//   それぞれ二頭+三頭のペア）。
// - priority選択時のみ登場するカテゴリ（core_2・calves）はday2に割り当てておく
//   （通常は週3日のcutoff外だがpriority枠経由でrank10/11に来た場合のみ登場する）。
const DAY3_PLACEMENT: Partial<Record<string, number>> = {
  chest_press: 1, shoulder_press: 1, leg_squat: 1, core_1: 1, triceps_1: 1, biceps_1: 1,
  back_row: 2, back_pull: 2, leg_hinge: 2, leg_2: 2, chest_fly: 2, shoulder_rear_delt: 2, core_2: 2, calves: 2,
  shoulder_lateral: 3, back_2: 3, leg_default: 3, leg_curl: 3, biceps_2: 3, triceps_2: 3,
}

/** そのカテゴリを配置してよい日番号の候補を返す（優先順位はつけない）。 */
function eligibleDays(days: DaysPerWeek, category: CompositionCategory): number[] {
  if (days === 3) {
    const d = DAY3_PLACEMENT[category.id]
    return d != null ? [d] : [1, 2, 3]
  }

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
      // 6パターン該当カテゴリはmovementPatternが必ず単一値（配列指定は脚2種目目等の
      // 6パターン外カテゴリのみ、brainstorm #10）
      const d = dayForPattern[typeof category.movementPattern === 'string' ? category.movementPattern : '']
      return d != null ? [d] : [1, 2]
    }
    return [1, 2]
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
