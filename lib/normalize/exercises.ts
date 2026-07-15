import type { UserExercise, TargetMuscle, IntensityTechnique } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { TRAINING } from '@/lib/constants/training'

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
  weight_increment_kg?: number | null
  sort_order: number
  is_active: boolean
  is_bodyweight: boolean
  is_compound?: boolean
  created_at: string
  recent_session_ids?: string[] | null
  exercise_master: { name: string; target_muscle: string; is_bodyweight: boolean; is_compound?: boolean; intensity_technique?: IntensityTechnique; requires_one_rm?: boolean; movement_pattern?: string | null } | null
}

const VALID_MUSCLES = Object.keys(TARGET_MUSCLE_LABELS)

function normalizeExercise(e: RawUserExercise): UserExercise {
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

  // DB値があればそれを使用、なければ is_compound でデフォルトを決定
  const weight_increment_kg = e.weight_increment_kg != null
    ? e.weight_increment_kg
    : is_compound
      ? TRAINING.COMPOUND_WEIGHT_INCREMENT_KG
      : TRAINING.ISOLATION_WEIGHT_INCREMENT_KG

  // カスタム種目にはintensity_technique列を持たせていないため常に'none'。
  // マスタ種目はexercise_master.intensity_techniqueを使用（未設定なら'none'）。
  const intensity_technique: IntensityTechnique = e.custom_name
    ? 'none'
    : (e.exercise_master?.intensity_technique ?? 'none')

  // カスタム種目には1RM管理の概念を持たせていないため常にfalse。
  // マスタ種目はexercise_master.requires_one_rmを使用（未設定ならfalse）。
  const requires_one_rm = e.custom_name
    ? false
    : (e.exercise_master?.requires_one_rm ?? false)

  // カスタム種目にはmovement_patternの概念を持たせていないためnull
  // （requires_one_rmも常にfalseなので、hasOneRm判定でこの値が参照されることはない）。
  const movement_pattern = e.custom_name
    ? null
    : (e.exercise_master?.movement_pattern ?? null)

  return {
    ...e,
    custom_target_muscle: e.custom_target_muscle as TargetMuscle | null,
    name,
    target_muscle,
    is_bodyweight: isBodyweight,
    is_compound,
    intensity_technique,
    requires_one_rm,
    movement_pattern,
    weight_increment_kg,
    recent_session_ids: e.recent_session_ids ?? [],
  }
}

export function normalizeExercises(rows: RawUserExercise[]): UserExercise[] {
  return rows.map(normalizeExercise)
}
