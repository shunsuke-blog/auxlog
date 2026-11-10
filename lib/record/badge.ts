import type { SetData } from '@/components/record/SetRow'

// 記録中に出すバッジの判定（セルフモードの記録画面とコーチングモードの記録画面で共通）。
// ワーキングセットをすべてチェックした時だけ出す。前回の記録と比べて、
// 最大重量が上回れば weight_up、同じ重量で回数が上回れば reps_up、総挙上量が上回れば volume_up、それ以外は done。
// 表示は日本語（2026-11-07 hallmark の audit、それまでは Record! / Volume Up! / Good Job!。アプリと同じ）。
// 「前回超え」は重量を上げて回数が減った時に、総挙上量が前回より少ないのに出て矛盾して見えたので、何が上がったかを書く（2026-11-10）

export type Badge = 'weight_up' | 'reps_up' | 'volume_up' | 'done'

export const BADGE_LABEL: Record<Badge, string> = {
  weight_up: '重量アップ',
  reps_up: '回数アップ',
  volume_up: '総挙上量アップ',
  done: '完了',
}

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

  if (currWeight > prev.weight) return 'weight_up'
  if (currWeight === prev.weight && currReps > prev.reps) return 'reps_up'
  if (currVolume > prev.volume) return 'volume_up'
  return 'done'
}
