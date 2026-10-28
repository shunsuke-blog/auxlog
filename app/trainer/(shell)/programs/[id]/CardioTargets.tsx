'use client'

import { toDecimalInput, toIntegerInput } from '@/lib/utils/number_input'

type Props = {
  minutes: string
  distanceKm: string
  onChange: (patch: { targetMinutes?: string; targetDistanceKm?: string }) => void
}

const inputClass = 'w-24 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-black dark:text-white tabular-nums focus:outline-none focus:border-zinc-400'

// 有酸素運動の目標（2026-10-26）。セットの表の代わりに、時間（分、必須）と距離（km、任意）を入れる。
// クライアントは時間・距離・消費カロリーを記録する
export default function CardioTargets({ minutes, distanceKm, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="space-y-1">
        <span className="block text-xs text-zinc-400">目標の時間（分）</span>
        <input inputMode="numeric" maxLength={4} value={minutes} onChange={e => onChange({ targetMinutes: toIntegerInput(e.target.value) })} placeholder="30" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-zinc-400">目標の距離（km、任意）</span>
        <input inputMode="decimal" maxLength={6} value={distanceKm} onChange={e => onChange({ targetDistanceKm: toDecimalInput(e.target.value) })} placeholder="5.0" className={inputClass} />
      </label>
    </div>
  )
}
