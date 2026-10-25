// 1RM の推定・重量の丸めのドメインロジック（DB・画面に依存しない純粋関数、2026-10-25 レビュー対応 M4）。
// コーチングモードの初回記録からの推定・成長レポート・契約終了後のセルフモード自動作成はここを使う。
// DB 側（round_to_plate・fill_plan_weights）は丸めと上限の確認だけで、推定はしない。

import { estimateOneRm } from '@/lib/utils/epley'

/** 1RM の推定に使うワーキングセットの回数の上限（回数が多いと Epley の誤差が大きい） */
export const MAX_REPS_FOR_ESTIMATE = 12
/** 現実的な重量・1RM の上限（kg）。トレーナーが入力する1RM・DB の記録の制約と同じ */
export const MAX_PLAUSIBLE_KG = 500
/** プレートの刻み（kg） */
export const PLATE_STEP_KG = 2.5

export type EstimateSet = { weight_kg: number; reps: number; is_warmup?: boolean }

/** 1RM の推定に使えるセットか: ウォームアップでなく、重量 0 より大きく上限以下、回数 1〜12 */
export function isUsableForEstimate(s: EstimateSet): boolean {
  const w = Number(s.weight_kg)
  return !s.is_warmup && w > 0 && w <= MAX_PLAUSIBLE_KG && s.reps >= 1 && s.reps <= MAX_REPS_FOR_ESTIMATE
}

/** 重量を2.5kg単位に丸める（DB の round_to_plate と同じ） */
export function roundToPlate(kg: number): number {
  return Math.round(kg / PLATE_STEP_KG) * PLATE_STEP_KG
}

/**
 * セットの記録から1RMを推定する（Epley、1回なら重量そのもの）。使えるセットの推定値の最大。
 * 使えるセットが無ければ null。結果は上限（500kg）を超えない。
 */
export function estimateOneRmFromSets(sets: EstimateSet[], roundToKg = 1): number | null {
  const estimates = sets.filter(isUsableForEstimate).map(s => estimateOneRm(Number(s.weight_kg), s.reps, roundToKg))
  if (estimates.length === 0) return null
  return Math.min(Math.max(...estimates), MAX_PLAUSIBLE_KG)
}
