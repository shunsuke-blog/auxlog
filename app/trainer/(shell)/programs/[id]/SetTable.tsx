'use client'

import { X } from 'lucide-react'
import type { EditorSet, WeightMode } from '@/lib/trainer/templateEditor'

const MODE_LABELS: Record<WeightMode, string> = { pct: '%1RM', kg: 'kg', auto: '自動' }
export const blankSet = (): EditorSet => ({ mode: 'auto', value: '', reps: '10', rir: '2', isWarmup: false })

const inputClass = 'px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white'

// テンプレートの種目のセット（重量の種類・重量・回数・RIR・ウォームアップ）の表
export default function SetTable({ sets, onChange, onRemove, onAdd }: {
  sets: EditorSet[]
  onChange: (idx: number, patch: Partial<EditorSet>) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}) {
  // Tab キーは 重量 → 回数 → RIR → 次のセットの重量… の順に進む（2026-10-22 オーナー依頼）。
  // W-UP・重量の種類・セットの削除は tabIndex={-1} で Tab の移動先から外す（マウスでは今までどおり操作できる）。
  // 重量が「自動」のセットは重量の入力欄が無いので、回数から始まる。
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="text-[11px] text-zinc-400 text-left">
              <th className="font-medium py-1 pr-2 w-10">セット</th>
              <th className="font-medium py-1 pr-2">W-UP</th>
              <th className="font-medium py-1 pr-2">重量</th>
              <th className="font-medium py-1 pr-2 w-20">回数</th>
              <th className="font-medium py-1 pr-2 w-16">RIR</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sets.map((s, i) => (
              <tr key={i} className="align-middle">
                <td className="py-1 pr-2 text-zinc-500 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-2">
                  <input type="checkbox" tabIndex={-1} aria-label={`${i + 1}セット目をウォームアップにする`} checked={s.isWarmup} onChange={e => onChange(i, { isWarmup: e.target.checked })} />
                </td>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1">
                    <select tabIndex={-1} aria-label={`${i + 1}セット目の重量の種類`} value={s.mode} onChange={e => onChange(i, { mode: e.target.value as WeightMode, value: '' })} className={`${inputClass} text-xs`}>
                      {(Object.keys(MODE_LABELS) as WeightMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                    </select>
                    {s.mode !== 'auto' && (
                      <input inputMode="decimal" aria-label={`${i + 1}セット目の重量`} value={s.value} onChange={e => onChange(i, { value: e.target.value })} placeholder={s.mode === 'pct' ? '75' : '60'} className={`${inputClass} w-16`} />
                    )}
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" aria-label={`${i + 1}セット目の回数`} value={s.reps} onChange={e => onChange(i, { reps: e.target.value })} className={`${inputClass} w-16`} />
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" aria-label={`${i + 1}セット目のRIR`} value={s.rir} onChange={e => onChange(i, { rir: e.target.value })} placeholder="-" className={`${inputClass} w-12`} />
                </td>
                <td className="py-1">
                  <button tabIndex={-1} onClick={() => onRemove(i)} disabled={sets.length <= 1} title="セットを削除" className="p-1 text-zinc-300 hover:text-red-500 disabled:opacity-30">
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} disabled={sets.length >= 20} className="text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30">
        + セットを追加
      </button>
    </>
  )
}
