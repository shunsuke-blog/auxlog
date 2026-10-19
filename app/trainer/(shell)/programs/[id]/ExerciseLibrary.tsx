'use client'

import { useState } from 'react'
import { ChevronDown, GripVertical, Plus, Search } from 'lucide-react'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import type { CatalogExercise } from '@/lib/trainer/templateEditor'

/** ドラッグ中の種目を渡すときの dataTransfer の型名 */
export const LIBRARY_DRAG_TYPE = 'application/x-auxlog-exercise'

export const catalogKey = (e: CatalogExercise) => (e.exerciseMasterId ? `m:${e.exerciseMasterId}` : `t:${e.trainerExerciseId}`)

type Props = {
  catalog: CatalogExercise[]
  /** クリック（＋）で今の Day の最後に追加する */
  onAdd: (ex: CatalogExercise) => void
  /** 一覧に無い種目を独自の種目として作る（検索語を初期値にして作成画面を開く） */
  onCreate: (name: string) => void
  disabled?: boolean
}

// テンプレート編集（Dayごと）の右側に置く種目の一覧。部位ごとに分けて、Day へドラッグ＆ドロップか
// ＋で追加する（2026-10-19 オーナー依頼）。
export default function ExerciseLibrary({ catalog, onAdd, onCreate, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const q = query.trim()
  const filtered = q ? catalog.filter(e => e.name.includes(q)) : catalog
  const groups: { key: string; label: string; items: CatalogExercise[] }[] = [
    { key: 'own', label: '独自の種目', items: filtered.filter(e => e.trainerExerciseId) },
    ...MUSCLE_ORDER.map(m => ({
      key: m,
      label: TARGET_MUSCLE_LABELS[m],
      items: filtered.filter(e => e.exerciseMasterId && e.targetMuscle === m),
    })),
    {
      key: 'other',
      label: 'その他',
      items: filtered.filter(e => e.exerciseMasterId && !MUSCLE_ORDER.includes(e.targetMuscle as TargetMuscle)),
    },
  ].filter(g => g.items.length > 0)

  const toggle = (key: string) =>
    setClosed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 space-y-2 border-b border-zinc-100 dark:border-zinc-900">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">種目（ドラッグして追加）</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="種目名で検索"
            className="flex-1 min-w-0 text-sm bg-transparent text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {groups.map(g => {
          const open = q !== '' || !closed.has(g.key)
          return (
            <div key={g.key} className="rounded-2xl border border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 overflow-hidden">
              <button
                onClick={() => toggle(g.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left"
              >
                <span className="text-xs font-semibold text-black dark:text-white">
                  {g.label}
                  <span className="ml-1.5 font-normal text-zinc-400">{g.items.length}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-1">
                  {g.items.map(e => (
                    <div
                      key={catalogKey(e)}
                      draggable={!disabled}
                      onDragStart={ev => {
                        ev.dataTransfer.setData(LIBRARY_DRAG_TYPE, catalogKey(e))
                        ev.dataTransfer.effectAllowed = 'copy'
                      }}
                      className="group flex items-center gap-1.5 pl-1.5 pr-1 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical className="w-3.5 h-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />
                      <span className="flex-1 min-w-0 truncate text-[13px] text-black dark:text-white">{e.name}</span>
                      <button
                        onClick={() => onAdd(e)}
                        disabled={disabled}
                        title="この Day に追加"
                        className="p-1 rounded-md text-zinc-400 hover:text-black hover:bg-white dark:hover:text-white dark:hover:bg-zinc-800 disabled:opacity-30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {groups.length === 0 && <p className="px-1 text-xs text-zinc-400">見つかりませんでした</p>}

        {q && !catalog.some(e => e.name === q) && (
          <button
            onClick={() => onCreate(q)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-left text-xs text-zinc-500 hover:text-black dark:hover:text-white"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            「{q}」を独自の種目として作成
          </button>
        )}
      </div>
    </div>
  )
}
