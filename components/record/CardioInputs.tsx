'use client'

import { formatPace, parseCardioInput } from '@/lib/record/cardio'
import { toDecimalInput, toIntegerInput } from '@/lib/utils/number_input'

export type CardioInputValue = { minutes: string; distanceKm: string; calories: string }

/** 保存済みの記録から入力欄の値へ */
export function cardioInputFrom(r: { duration_seconds?: number | null; distance_km?: number | string | null; calories_kcal?: number | null }): CardioInputValue {
  return {
    minutes: r.duration_seconds != null ? String(Math.round(r.duration_seconds / 60)) : '',
    distanceKm: r.distance_km != null ? String(Number(r.distance_km)) : '',
    calories: r.calories_kcal != null ? String(r.calories_kcal) : '',
  }
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-base tabular-nums outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700'

type Props = {
  value: CardioInputValue
  onChange: (value: CardioInputValue) => void
  /** 距離の欄を出すか（縄跳び・ステアクライマーは出さない） */
  tracksDistance: boolean
}

// 有酸素運動の入力欄（時間・距離・消費カロリー、2026-10-26）。記録画面と編集画面で共通
export default function CardioInputs({ value, onChange, tracksDistance }: Props) {
  const parsed = parseCardioInput({ ...value, distanceKm: tracksDistance ? value.distanceKm : '' })
  const pace = parsed?.distance_km ? formatPace(parsed.duration_seconds, parsed.distance_km) : null
  const set = (key: keyof CardioInputValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: key === 'calories' ? toIntegerInput(e.target.value) : toDecimalInput(e.target.value) })

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-zinc-400">時間（分）</span>
        <input inputMode="decimal" maxLength={6} value={value.minutes} onChange={set('minutes')} placeholder="30" className={inputClass} />
      </label>
      {tracksDistance && (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-zinc-400">距離（km、任意）</span>
          <input inputMode="decimal" maxLength={6} value={value.distanceKm} onChange={set('distanceKm')} placeholder="5.0" className={inputClass} />
          {pace && <span className="block text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">ペース {pace}</span>}
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-zinc-400">消費カロリー（kcal、任意）</span>
        <input inputMode="numeric" maxLength={5} value={value.calories} onChange={set('calories')} placeholder="300" className={inputClass} />
      </label>
    </div>
  )
}
