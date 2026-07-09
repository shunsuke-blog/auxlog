/**
 * Epley式による1RM推定。reps<=1の場合はその重量をそのまま1RMとして扱う
 * （1回しか挙げていない場合に式で外挿すると実際よりわずかに重く出るため）。
 * roundToKg指定時はその単位(kg)に丸める（未指定なら1kg単位）。
 */
export function estimateOneRm(weight: number, reps: number, roundToKg = 1): number {
  if (reps <= 1) return weight
  const raw = weight * (1 + reps / 30)
  return Math.round(raw / roundToKg) * roundToKg
}
