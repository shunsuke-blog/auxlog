'use client'

import { useState } from 'react'
import RirToggle from './RirToggle'
import { Minus, Plus } from 'lucide-react'

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
  // 加重がある場合は最初から表示
  const [showWeight, setShowWeight] = useState(
    isBodyweight ? (setData.weight_kg !== '' && setData.weight_kg !== '0') : true
  )

  const handleToggleWeight = () => {
    if (showWeight) {
      // 加重を非表示にするとき重量をリセット
      onChange({ ...setData, weight_kg: '0' })
    }
    setShowWeight(v => !v)
  }

  return (
    <div className={`transition-opacity ${is_warmup ? 'opacity-60' : ''}`}>
      {is_warmup && (
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
            ウォームアップ
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* セット番号 */}
        <span className="w-5 text-xs font-medium text-zinc-400 dark:text-zinc-500 text-center shrink-0">
          {setData.set_number}
        </span>

        {isBodyweight ? (
          /* 自重種目: 加重はオプション */
          showWeight ? (
            <>
              <input
                type="number"
                inputMode="decimal"
                value={setData.weight_kg === '0' ? '' : setData.weight_kg}
                onChange={e => onChange({ ...setData, weight_kg: e.target.value || '0' })}
                placeholder="0"
                className="w-16 text-center py-2 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
              />
              <button
                type="button"
                onClick={handleToggleWeight}
                className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0 hover:text-red-400 transition-colors"
              >
                加重kg ✕
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleToggleWeight}
              className="flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-1.5 rounded-lg hover:border-zinc-400 hover:text-zinc-500 transition-colors shrink-0"
            >
              <Plus className="w-2.5 h-2.5" />
              加重
            </button>
          )
        ) : (
          /* 通常種目: 重量必須 */
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

        {/* 回数 */}
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

        {/* ウォームアップトグル */}
        <button
          type="button"
          onClick={() => onChange({ ...setData, is_warmup: !is_warmup })}
          className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
            is_warmup
              ? 'border-amber-400 text-amber-500 bg-amber-50 dark:bg-amber-950/40'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 hover:border-amber-300 hover:text-amber-400'
          }`}
        >
          W
        </button>

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
    </div>
  )
}
