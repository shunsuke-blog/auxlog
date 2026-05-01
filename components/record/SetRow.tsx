'use client'

import RirToggle from './RirToggle'
import { Minus } from 'lucide-react'

export type SetData = {
  set_number: number
  weight_kg: string
  reps: string
  rir: boolean
  is_warmup: boolean
}

type Props = {
  setData: SetData
  canDelete: boolean
  isBodyweight?: boolean
  onChange: (data: SetData) => void
  onDelete: () => void
}

export default function SetRow({ setData, canDelete, isBodyweight = false, onChange, onDelete }: Props) {
  const { is_warmup } = setData

  return (
    <div className={`flex items-center gap-2 ${is_warmup ? 'opacity-60' : ''}`}>
      {/* ウォームアップトグル */}
      <button
        type="button"
        onClick={() => onChange({ ...setData, is_warmup: !is_warmup })}
        title={is_warmup ? 'ワーキングセットに変更' : 'ウォームアップに変更'}
        className={`w-5 h-5 rounded-full text-[9px] font-bold shrink-0 transition-colors ${
          is_warmup
            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
            : 'text-zinc-300 dark:text-zinc-700'
        }`}
      >
        {is_warmup ? 'W' : setData.set_number}
      </button>

      {isBodyweight ? (
        <>
          <input
            type="number"
            inputMode="decimal"
            value={setData.weight_kg === '0' ? '' : setData.weight_kg}
            onChange={e => onChange({ ...setData, weight_kg: e.target.value || '0' })}
            placeholder="—"
            className="w-16 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
          />
          <span className="text-xs text-zinc-400 shrink-0">加重kg</span>
        </>
      ) : (
        <>
          <input
            type="number"
            inputMode="decimal"
            value={setData.weight_kg}
            onChange={e => onChange({ ...setData, weight_kg: e.target.value })}
            placeholder="0"
            className="w-16 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
          />
          <span className="text-xs text-zinc-400 shrink-0">kg</span>
        </>
      )}

      <input
        type="number"
        inputMode="numeric"
        value={setData.reps}
        onChange={e => onChange({ ...setData, reps: e.target.value })}
        placeholder="0"
        className="w-14 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
      />
      <span className="text-xs text-zinc-400 shrink-0">回</span>
      <RirToggle
        value={setData.rir}
        onChange={rir => onChange({ ...setData, rir })}
      />
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-zinc-300 dark:text-zinc-700 hover:text-red-400 transition-colors shrink-0"
        >
          <Minus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
