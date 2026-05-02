'use client'

import { useState } from 'react'
import RirToggle from './RirToggle'
import { Minus, Plus, Check } from 'lucide-react'

export type SetData = {
  set_number: number
  weight_kg: string
  reps: string
  rir: boolean
  is_warmup: boolean
  done: boolean
}

type Props = {
  setData: SetData
  canDelete: boolean
  isBodyweight?: boolean
  onChange: (data: SetData) => void
  onDelete: () => void
}

export default function SetRow({ setData, canDelete, isBodyweight = false, onChange, onDelete }: Props) {
  const { is_warmup, done } = setData
  const [showWeight, setShowWeight] = useState(
    isBodyweight ? (setData.weight_kg !== '' && setData.weight_kg !== '0') : true
  )

  const handleWeightChange = (val: string) => {
    onChange({ ...setData, weight_kg: val || '0', done: val !== '' ? true : setData.done })
  }
  const handleRepsChange = (val: string) => {
    onChange({ ...setData, reps: val, done: val !== '' ? true : setData.done })
  }
  const handleToggleWeight = () => {
    if (showWeight) onChange({ ...setData, weight_kg: '0' })
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
        {/* 削除ボタン（左端：実施ボタンと離す） */}
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-zinc-300 dark:text-zinc-700 hover:text-red-400 transition-colors shrink-0"
          >
            <Minus className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        {/* セット番号 */}
        <span className="w-4 text-xs font-medium text-zinc-400 dark:text-zinc-500 text-center shrink-0">
          {setData.set_number}
        </span>

        {isBodyweight ? (
          showWeight ? (
            <>
              <input
                type="text"
                inputMode="decimal"
                value={setData.weight_kg === '0' ? '' : setData.weight_kg}
                onFocus={e => e.target.select()}
                onChange={e => handleWeightChange(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                className="w-14 text-center py-2 px-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
              />
              <button
                type="button"
                onClick={handleToggleWeight}
                className="text-[10px] text-zinc-400 shrink-0 hover:text-red-400 transition-colors"
              >
                加重kg ✕
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleToggleWeight}
              className="flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-1.5 rounded-lg hover:border-zinc-400 transition-colors shrink-0"
            >
              <Plus className="w-2.5 h-2.5" />
              加重
            </button>
          )
        ) : (
          <>
            <input
              type="text"
              inputMode="decimal"
              value={setData.weight_kg}
              onFocus={e => e.target.select()}
              onChange={e => handleWeightChange(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              className="w-14 text-center py-2 px-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
            />
            <span className="text-xs text-zinc-400 shrink-0">kg</span>
          </>
        )}

        <input
          type="text"
          inputMode="numeric"
          value={setData.reps}
          onFocus={e => e.target.select()}
          onChange={e => handleRepsChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          className="w-12 text-center py-2 px-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm font-medium outline-none focus:border-black dark:focus:border-white transition-colors"
        />
        <span className="text-xs text-zinc-400 shrink-0">回</span>

        {!is_warmup && (
          <RirToggle value={setData.rir} onChange={rir => onChange({ ...setData, rir })} />
        )}

        {/* ウォームアップトグル（右側・より説明的なラベル） */}
        <button
          type="button"
          title="ウォームアップセットとしてマーク"
          onClick={() => onChange({ ...setData, is_warmup: !is_warmup })}
          className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
            is_warmup
              ? 'border-amber-400 text-amber-500 bg-amber-50 dark:bg-amber-950/40'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 hover:border-amber-300 hover:text-amber-400'
          }`}
        >
          {is_warmup ? 'W/UP' : 'W/UP'}
        </button>

        {/* 実施フラグ（右端・右利きに配慮） */}
        <button
          type="button"
          onClick={() => onChange({ ...setData, done: !done })}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors border-2 ${
            done
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-zinc-300 dark:border-zinc-600 text-transparent'
          }`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
