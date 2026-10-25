import type { SupabaseClient } from '@supabase/supabase-js'
import { MUSCLE_ORDER, type TargetMuscle } from '@/types'

// トレーニー追加時に1RMを聞く種目 = テンプレート内で %1RM を使っている種目。
// 部位別（体の上から 胸・背中・肩・腕・脚・体幹）に並べ、同じ部位の中は種目マスタの並び順（2026-10-25）。
// 一覧画面で全テンプレート分を毎回読まず、ダイアログでテンプレートを選んだ時に読む（レビュー対応 M5）。

export type OneRmExercise = { exerciseMasterId: string | null; trainerExerciseId: string | null; name: string; targetMuscle: string | null; sortOrder: number }

type Row = {
  exercise_master_id: string | null
  trainer_exercise_id: string | null
  exercise_master: { name: string; target_muscle: string | null; sort_order: number } | null
  trainer_exercises: { name: string; target_muscle: string | null } | null
}

export async function loadTemplateOneRmExercises(supabase: SupabaseClient, templateId: string): Promise<OneRmExercise[]> {
  // %1RM のセットがある種目だけ（plan_sets を inner で結合して絞る）
  const { data } = await supabase
    .from('plan_exercises')
    .select('exercise_master_id, trainer_exercise_id, exercise_master(name, target_muscle, sort_order), trainer_exercises(name, target_muscle), plan_days!inner(plan_id), plan_sets!inner(target_pct_1rm)')
    .eq('plan_days.plan_id', templateId)
    .not('plan_sets.target_pct_1rm', 'is', null)
  const seen = new Map<string, OneRmExercise>()
  for (const e of (data ?? []) as unknown as Row[]) {
    const key = e.exercise_master_id ?? e.trainer_exercise_id ?? ''
    if (seen.has(key)) continue
    seen.set(key, {
      exerciseMasterId: e.exercise_master_id,
      trainerExerciseId: e.trainer_exercise_id,
      name: e.exercise_master?.name ?? e.trainer_exercises?.name ?? '',
      targetMuscle: e.exercise_master?.target_muscle ?? e.trainer_exercises?.target_muscle ?? null,
      sortOrder: e.exercise_master?.sort_order ?? Number.MAX_SAFE_INTEGER,
    })
  }
  const muscleRank = (m: string | null) => { const i = MUSCLE_ORDER.indexOf(m as TargetMuscle); return i < 0 ? MUSCLE_ORDER.length : i }
  return [...seen.values()].sort((a, b) => muscleRank(a.targetMuscle) - muscleRank(b.targetMuscle) || a.sortOrder - b.sortOrder)
}
