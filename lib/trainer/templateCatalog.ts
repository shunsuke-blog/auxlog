import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogExercise } from './templateEditor'

// テンプレートで選べる種目の一覧（トレーナーの独自種目 → 種目マスタ → 有酸素の一覧の順）。
// テンプレートの編集画面・メニューのインポート（2026-10-28）で使う。読めなかった時は null
export async function loadTemplateCatalog(supabase: SupabaseClient, trainerId: string): Promise<CatalogExercise[] | null> {
  const [{ data: master, error: e1 }, { data: own, error: e2 }, { data: cardio, error: e3 }] = await Promise.all([
    supabase.from('exercise_master').select('id, name, target_muscle, movement_pattern, requires_one_rm').order('sort_order'),
    supabase.from('trainer_exercises').select('id, name, target_muscle').eq('trainer_id', trainerId).order('created_at'),
    supabase.from('cardio_master').select('id, name').order('sort_order'),
  ])
  if (e1 || e2 || e3) {
    console.error('[template catalog]', e1 ?? e2 ?? e3)
    return null
  }
  return [
    ...(own ?? []).map(e => ({ exerciseMasterId: null, trainerExerciseId: e.id as string, name: e.name as string, targetMuscle: (e.target_muscle as string | null) ?? null })),
    ...(master ?? []).map(e => ({ exerciseMasterId: e.id as string, trainerExerciseId: null, name: e.name as string, targetMuscle: (e.target_muscle as string | null) ?? null, movementPattern: (e.movement_pattern as string | null) ?? null, requiresOneRm: e.requires_one_rm === true })),
    // 有酸素運動（2026-10-26）。部位は 'cardio' として扱う
    ...(cardio ?? []).map(e => ({ exerciseMasterId: null, trainerExerciseId: null, cardioMasterId: e.id as string, name: e.name as string, targetMuscle: 'cardio' })),
  ]
}
