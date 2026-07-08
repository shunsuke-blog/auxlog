import { createClient } from '@/lib/supabase/server'
import OnboardingClient, { type ExerciseMasterRow } from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()
  // movement_patternが種目のカテゴリ判定に使われる（program_composition.ts）ため、
  // slot_typeではなくmovement_patternの有無でカタログ対象を絞る（2026-07-08新方式移行）。
  // tier<=2（デフォルト推奨〜準推奨）のみをオンボーディングのチェックリストに出す
  // （2026-07-08、実機確認フィードバック対応。lib/sql/add_exercise_tier.sql参照）
  const { data } = await supabase
    .from('exercise_master')
    .select('id, name, target_muscle, movement_pattern, requires_one_rm')
    .not('movement_pattern', 'is', null)
    .lte('tier', 2)
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
