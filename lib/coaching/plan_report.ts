import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrowthReport, OneRmGain } from '@/lib/program/week9-report'
import { estimateOneRmFromSets, isUsableForEstimate } from './one_rm'

// コーチングプランの成長レポート（プラン完了時に見せる）。セルフモードの成長レポートと同じ形で返し、
// 表示は GrowthReportModal を使い回す。
//   - 回数・総重量: このプランに紐付いた記録（plan_exercise_id）
//   - 種目別の変化: 種目ごとに、最初に記録した日と最後に記録した日の推定1RM（Epley）を比べる


type SetRow = {
  weight_kg: number
  reps: number
  is_warmup: boolean
  plan_exercise_id: string
  training_sessions: { id: string; trained_at: string }
}

export async function computePlanGrowthReport(
  supabase: SupabaseClient,
  plan: { id: string; startedAt: string | null },
  today: string,
): Promise<GrowthReport> {
  const { data: days } = await supabase
    .from('plan_days')
    .select('plan_exercises(id, exercise_master(name), trainer_exercises(name), cardio_master(name))')
    .eq('plan_id', plan.id)
  type ExRow = { id: string; exercise_master: { name: string } | null; trainer_exercises: { name: string } | null; cardio_master: { name: string } | null }
  const nameByPlanExercise = new Map<string, string>()
  for (const d of (days ?? []) as unknown as { plan_exercises: ExRow[] }[]) {
    for (const e of d.plan_exercises) nameByPlanExercise.set(e.id, e.exercise_master?.name ?? e.trainer_exercises?.name ?? e.cardio_master?.name ?? '種目')
  }

  const ids = [...nameByPlanExercise.keys()]
  const { data } = ids.length > 0
    ? await supabase
        .from('training_sets')
        // 種目IDの一覧を URL に並べると、件数が多い時に HTTP 400 になるため、結合でプランを条件にする（2026-10-25 レビュー対応 H1）
        .select('weight_kg, reps, is_warmup, plan_exercise_id, training_sessions!inner(id, trained_at), plan_exercises!inner(plan_days!inner(plan_id))')
        .eq('plan_exercises.plan_days.plan_id', plan.id)
    : { data: [] }
  const sets = (data ?? []) as unknown as SetRow[]

  const sessionIds = new Set(sets.map(s => s.training_sessions.id))
  const totalVolume = sets.filter(s => !s.is_warmup).reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0)

  // 種目名ごと・記録日ごとの推定1RMの最大
  const byName = new Map<string, Map<string, number>>()
  for (const s of sets) {
    const w = Number(s.weight_kg)
    if (!isUsableForEstimate({ weight_kg: w, reps: s.reps, is_warmup: s.is_warmup })) continue
    const name = nameByPlanExercise.get(s.plan_exercise_id) ?? '種目'
    const byDate = byName.get(name) ?? new Map<string, number>()
    const est = estimateOneRmFromSets([{ weight_kg: w, reps: s.reps }])!
    byDate.set(s.training_sessions.trained_at, Math.max(byDate.get(s.training_sessions.trained_at) ?? 0, est))
    byName.set(name, byDate)
  }

  const gains: OneRmGain[] = []
  for (const [name, byDate] of byName) {
    const dates = [...byDate.keys()].sort()
    const first = byDate.get(dates[0])!
    const last = byDate.get(dates[dates.length - 1])!
    gains.push({
      slot_id: name,
      exercise_name: name,
      // 1回しか記録していない種目は比較できないので「基準」として見せる
      old_one_rm_kg: dates.length > 1 ? first : null,
      new_one_rm_kg: last,
    })
  }
  gains.sort((a, b) => (b.new_one_rm_kg - (b.old_one_rm_kg ?? b.new_one_rm_kg)) - (a.new_one_rm_kg - (a.old_one_rm_kg ?? a.new_one_rm_kg)))

  const dates = sets.map(s => s.training_sessions.trained_at).sort()
  return {
    cycle_started_at: (plan.startedAt ?? dates[0] ?? today).slice(0, 10),
    cycle_completed_at: today,
    total_sessions: sessionIds.size,
    total_volume_kg: Math.round(totalVolume),
    one_rm_gains: gains,
  }
}
