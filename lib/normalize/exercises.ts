import type { UserExercise, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'

/**
 * Supabase から取得した生データを UserExercise 型に正規化する
 * - custom_name があればカスタム種目、なければ exercise_master から取得
 * - is_bodyweight はカスタム種目なら user_exercises から、マスタ種目なら exercise_master から取得
 */
export type RawUserExercise = {
  id: string
  user_id: string
  exercise_master_id: string | null
  custom_name: string | null
  custom_target_muscle: string | null
  default_sets: number
  default_reps: number
  sort_order: number
  is_active: boolean
  is_bodyweight: boolean
  is_compound?: boolean
  created_at: string
  exercise_master: { name: string; target_muscle: string; is_bodyweight: boolean; is_compound?: boolean } | null
}

const VALID_MUSCLES = Object.keys(TARGET_MUSCLE_LABELS)

export function normalizeExercise(e: RawUserExercise): UserExercise {
  const name = e.custom_name ?? e.exercise_master?.name ?? ''
  const rawMuscle = e.custom_target_muscle ?? e.exercise_master?.target_muscle ?? ''
  const isBodyweight = e.custom_name
    ? (e.is_bodyweight ?? false)
    : (e.exercise_master?.is_bodyweight ?? false)

  // 不正な筋群値は 'chest' にフォールバック（DB 不整合対策）
  const target_muscle: TargetMuscle = VALID_MUSCLES.includes(rawMuscle)
    ? (rawMuscle as TargetMuscle)
    : 'chest'

  // カスタム種目は user_exercises.is_compound、マスタ種目は exercise_master.is_compound を使用
  const is_compound = e.custom_name
    ? (e.is_compound ?? false)
    : (e.exercise_master?.is_compound ?? false)

  return {
    ...e,
    custom_target_muscle: e.custom_target_muscle as TargetMuscle | null,
    name,
    target_muscle,
    is_bodyweight: isBodyweight,
    is_compound,
  }
}

export function normalizeExercises(rows: RawUserExercise[]): UserExercise[] {
  return rows.map(normalizeExercise)
}
