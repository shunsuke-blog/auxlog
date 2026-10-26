import type { SetData } from '@/components/record/SetRow'

// 記録中に出す「Record! / Volume Up! / Good Job!」の判定（セルフモードの記録画面とコーチングモードの記録画面で共通）。
// ワーキングセットをすべてチェックした時だけ出す。前回までの自己ベスト（exercise_bests）と比べて、
// 最大重量（同じ重量なら回数）が上回れば record、総挙上量が上回れば volume_up、それ以外は done。

export type Badge = 'record' | 'volume_up' | 'done'

export type PrevBest = { weight: number; reps: number; volume: number; totalReps: number }

export function calcBadge(
  workingSets: SetData[],
  allDone: boolean,
  prev: { weight: number; reps: number; volume: number } | undefined,
): Badge | null {
  if (!allDone) return null
  const done = workingSets.filter(s => s.done)
  if (done.length === 0) return 'done'
  if (!prev || prev.weight === 0) return 'done'

  const currWeight = Math.max(...done.map(s => s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)))
  const currReps = Math.max(
    ...done
      .filter(s => (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)) === currWeight)
      .map(s => parseInt(s.reps) || 0)
  )
  const currVolume = done.reduce(
    (sum, s) => sum + (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)) * (parseInt(s.reps) || 0),
    0,
  )

  if (currWeight > prev.weight || (currWeight === prev.weight && currReps > prev.reps)) return 'record'
  if (currVolume > prev.volume) return 'volume_up'
  return 'done'
}
