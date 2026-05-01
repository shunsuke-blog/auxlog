'use client'

import RirToggle from './RirToggle'
import { Minus } from 'lucide-react'

export type SetData = {
  set_number: number
  weight_kg: string
  reps: string
  rir: boolean
}

type Props = {
  setData: SetData
  canDelete: boolean
  onChange: (data: SetData) => void
  onDelete: () => void
}

export default function SetRow({ setData, canDelete, onChange, onDelete }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-xs font-medium text-zinc-400 dark:text-zinc-500 text-center flex-shrink-0">
        {setData.set_number}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={setData.weight_kg}
        onChange={e => onChange({ ...setData, weight_kg: e.target.value })}
        placeholder="0"
        className="w-16 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
      />
      <span className="text-xs text-zinc-400 flex-shrink-0">kg</span>
      <input
        type="number"
        inputMode="numeric"
        value={setData.reps}
        onChange={e => onChange({ ...setData, reps: e.target.value })}
        placeholder="0"
        className="w-14 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
      />
      <span className="text-xs text-zinc-400 flex-shrink-0">回</span>
      <RirToggle
        value={setData.rir}
        onChange={rir => onChange({ ...setData, rir })}
      />
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-zinc-300 dark:text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Minus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
