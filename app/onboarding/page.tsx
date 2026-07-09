import { createClient } from '@/lib/supabase/server'
import OnboardingClient, { type ExerciseMasterRow } from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()
  // movement_patternが種目のカテゴリ判定に使われる（program_composition.ts）ため、
  // slot_typeではなくmovement_patternの有無でカタログ対象を絞る（2026-07-08新方式移行）。
  // tier<=2（デフォルト推奨〜準推奨）のみをオンボーディングのチェックリストに出す
  // （2026-07-08、実機確認フィードバック対応。lib/sql/add_exercise_tier.sql参照）。
  // 並び順はtier昇順を優先し、同tier内はsort_orderで並べる（2026-07-10訂正: 以前は
  // sort_orderのみで並べていたため、同じカテゴリ内でtier2の種目がtier1より若い
  // sort_orderを持つ場合、buildSlotSelections()のデフォルト自動補完がtier1ではなく
  // sort_orderが若い方を選んでしまっていた。tierは「推奨度」・sort_orderは元々の
  // 表示順という別の役割のため、まずtierで並べるのが正しい）。
  const { data } = await supabase
    .from('exercise_master')
    .select('id, name, target_muscle, movement_pattern, requires_one_rm')
    .not('movement_pattern', 'is', null)
    .lte('tier', 2)
    .order('tier')
    .order('sort_order')

  const exercises: ExerciseMasterRow[] = (data ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    target_muscle: r.target_muscle as string,
    movement_pattern: r.movement_pattern as string,
    requires_one_rm: r.requires_one_rm as boolean,
  }))

  return <OnboardingClient exercises={exercises} />
}
