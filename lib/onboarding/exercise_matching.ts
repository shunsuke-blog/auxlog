// オンボーディングの種目選択ウィザードが使う、カテゴリ⇔種目のマッチングロジック。
// UIコンポーネント(OnboardingClient.tsx)から切り出した純粋関数群（2026-07-09、
// コードレビュー対応。1085行の単一コンポーネントにロジックとUIが同居しており、
// テストが無かったためバーベルカール誤割当バグ(movement_pattern未考慮)に
// 気づけなかった反省から、テスト可能な形に分離した）。

import type { CompositionCategory, PriorityMuscleOption } from '@/lib/constants/program_composition'
import { buildExerciseCategories, isOneRmDemotedAtDays, type DaysPerWeek } from '@/lib/suggest/generate_program_composition'

export type ExerciseMasterRow = {
  id: string
  name: string
  target_muscle: string
  movement_pattern: string
  /** この種目が1RM管理の対象かどうか（種目ごとの属性。program_composition.tsの
   *  カテゴリ単位のhasOneRmではなく、これが実際の1RM入力要否の正）。 */
  requires_one_rm: boolean
}

// 9週間プログラムのシート（UpperLowerBodyhypertrophy9weeks_sheet.xlsx）で
// 指定されている種目をデフォルトにする。sort_order順の先頭とは一致しない場合があるため明示指定
export const CATEGORY_DEFAULT_OVERRIDES: Partial<Record<string, string>> = {
  chest_fly: 'ケーブルフライ',
  back_row: 'チェストサポーテッドロウ',
  triceps_1: 'ライイングトライセプスEX',
  leg_2: 'ハイバースクワット',
  leg_default: 'ハイバースクワット',
  biceps_1: 'ダンベルカール',
  biceps_2: 'インクラインダンベルカール',
}

// オンボーディングの種目選択チェックリストには表示しない種目名
// （角度違いのバリエーションはコーチング画面の種目再選択でのみ選べる）
export const HIDDEN_ONBOARDING_NAMES = new Set([
  'ケーブルフライ（上部）',
  'ケーブルフライ（中部）',
  'ケーブルフライ（下部）',
])

/**
 * そのカテゴリでスワップ候補になる種目。movementPatternを持つカテゴリはそれで絞り込む
 * （腕は二頭/三頭、肩はプレス/側方/後部のように、同じ部位でも動きパターンが違えば
 * 別カテゴリとして区別する意味がなくなるため）。movementPatternを持たないカテゴリのみ
 * 部位一致にフォールバックする（2026-07-08、バーベルカールが三頭2種目目に誤割当される
 * バグの修正。brainstorm #3の「動きパターンでは絞らない」は撤回）。
 */
export function matchingExercises(category: CompositionCategory, exercises: ExerciseMasterRow[]): ExerciseMasterRow[] {
  return exercises.filter(e =>
    category.movementPattern ? e.movement_pattern === category.movementPattern : e.target_muscle === category.muscle
  )
}

/**
 * カテゴリに割り当てられた種目が実際に1RM管理の対象かどうか。種目ごとの属性
 * （exercise.requires_one_rm）が正で、週2日の格下げ対象カテゴリは強制的にfalseにする
 * （program_engine.tsのhasOneRm判定と同じロジック、2026-07-08実機確認フィードバック対応）。
 */
export function exerciseRequiresOneRm(
  category: CompositionCategory,
  exerciseName: string,
  exerciseByName: Map<string, ExerciseMasterRow>,
  days: DaysPerWeek,
): boolean {
  if (isOneRmDemotedAtDays(category, days)) return false
  return exerciseByName.get(exerciseName)?.requires_one_rm ?? false
}

export type BuildSlotSelectionsParams = {
  daysPerWeek: DaysPerWeek
  priorityMuscles: PriorityMuscleOption[]
  exercises: ExerciseMasterRow[]
  /** ユーザーが「今やっている種目」として明示的にチェックした種目名の集合 */
  selectedExercises: Set<string>
}

export type BuildSlotSelectionsResult = {
  names: Record<string, string>
  /** ユーザーが明示的に選んだ結果、割り当てられたカテゴリID（デフォルト自動補完は含まない） */
  userSelected: Set<string>
}

/**
 * 日数×priority選択から必要なカテゴリ一覧を求め、各カテゴリに種目を割り当てる。
 * 同じ部位の複数カテゴリ（例: chest_fly, chest_3）が同じ種目を重複して選ばないよう、
 * 一度使った種目名は次のカテゴリの候補から除外しながら順番に割り当てる。
 */
export function buildSlotSelections(params: BuildSlotSelectionsParams): BuildSlotSelectionsResult {
  const { daysPerWeek, priorityMuscles, exercises, selectedExercises } = params
  const categories = buildExerciseCategories(daysPerWeek, priorityMuscles)
  const usedNames = new Set<string>()
  const names: Record<string, string> = {}
  const userSelected = new Set<string>()

  categories.forEach(category => {
    const candidates = matchingExercises(category, exercises)
    let picked = candidates.find(e => selectedExercises.has(e.name) && !usedNames.has(e.name))
    if (picked) userSelected.add(category.id)
    if (!picked) {
      const overrideName = CATEGORY_DEFAULT_OVERRIDES[category.id]
      picked = overrideName ? candidates.find(e => e.name === overrideName && !usedNames.has(e.name)) : undefined
    }
    if (!picked) picked = candidates.find(e => !usedNames.has(e.name))
    if (!picked) picked = candidates[0]

    names[category.id] = picked?.name ?? ''
    if (picked) usedNames.add(picked.name)
  })

  return { names, userSelected }
}
