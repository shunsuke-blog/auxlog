'use client'

import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import type { CatalogExercise } from '@/lib/trainer/templateEditor'

type Props = {
  catalog: CatalogExercise[]
  onPick: (ex: CatalogExercise) => void
  onCreated: (ex: CatalogExercise) => void
  onClose: () => void
  /** 種目一覧から「独自の種目として作成」を押して開いた時の検索語（作成画面を開いた状態で始める） */
  initialQuery?: string
}

// テンプレートに追加する種目を選ぶ。マスタに無い種目は「独自の種目」として作成できる。
export default function ExercisePicker({ catalog, onPick, onCreated, onClose, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [creating, setCreating] = useState(!!initialQuery)
  const [muscle, setMuscle] = useState<TargetMuscle>('chest')
  const [isCompound, setIsCompound] = useState(false)
  const [isBodyweight, setIsBodyweight] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim()
  const filtered = q ? catalog.filter(e => e.name.includes(q)) : catalog
  const own = filtered.filter(e => e.trainerExerciseId)
  const master = filtered.filter(e => e.exerciseMasterId)

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q, target_muscle: muscle, is_compound: isCompound, is_bodyweight: isBodyweight }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '種目の作成に失敗しました')
      onCreated({ exerciseMasterId: null, trainerExerciseId: (data as { id: string }).id, name: q, targetMuscle: muscle })
    } catch (e) {
      setError(e instanceof Error ? e.message : '種目の作成に失敗しました')
      setBusy(false)
    }
  }

  const row = (e: CatalogExercise) => (
    <button
      key={e.exerciseMasterId ?? e.trainerExerciseId}
      onClick={() => onPick(e)}
      className="w-full flex items-center justify-between px-5 py-3 text-left border-b border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <span className="text-sm text-black dark:text-white">{e.name}</span>
      {e.targetMuscle && <span className="text-xs text-zinc-400">{TARGET_MUSCLE_LABELS[e.targetMuscle as TargetMuscle] ?? e.targetMuscle}</span>}
    </button>
  )

  return (
    // PCでは上揃え: 検索結果の件数や「独自の種目を作成」の展開で高さが変わっても、検索欄の位置を動かさない
    <div className="fixed inset-0 z-50 flex items-center md:items-start justify-center md:px-6 md:pt-[10vh]">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-full h-full md:h-auto md:max-h-[80vh] md:max-w-lg flex flex-col bg-white dark:bg-black md:rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-900">
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setCreating(false) }}
              placeholder="種目名で検索…"
              className="flex-1 text-sm bg-transparent text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {own.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-xs font-semibold text-zinc-400">独自の種目</p>
              {own.map(row)}
            </>
          )}
          {MUSCLE_ORDER.map(m => {
            const items = master.filter(e => e.targetMuscle === m)
            if (items.length === 0) return null
            return (
              <div key={m}>
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-zinc-400">{TARGET_MUSCLE_LABELS[m]}</p>
                {items.map(row)}
              </div>
            )
          })}

          {q && !catalog.some(e => e.name === q) && (
            creating ? (
              <div className="px-5 py-4 space-y-3 border-t border-zinc-100 dark:border-zinc-900">
                <p className="text-sm font-semibold text-black dark:text-white">「{q}」を独自の種目として作成</p>
                <div className="grid grid-cols-3 gap-2">
                  {MUSCLE_ORDER.map(m => (
                    <button
                      key={m}
                      onClick={() => setMuscle(m)}
                      className={`py-2 rounded-lg border text-sm ${muscle === m ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'border-zinc-200 dark:border-zinc-800 text-black dark:text-white'}`}
                    >
                      {TARGET_MUSCLE_LABELS[m]}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-black dark:text-white">
                  <input type="checkbox" checked={isCompound} onChange={e => setIsCompound(e.target.checked)} />
                  多関節種目（コンパウンド）
                </label>
                <label className="flex items-center gap-2 text-sm text-black dark:text-white">
                  <input type="checkbox" checked={isBodyweight} onChange={e => setIsBodyweight(e.target.checked)} />
                  自重種目
                </label>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button onClick={handleCreate} disabled={busy} className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
                  {busy ? '作成中…' : '作成して追加'}
                </button>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} className="w-full flex items-center gap-3 px-5 py-4 text-left border-t border-zinc-100 dark:border-zinc-900">
                <Plus className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">「{q}」を独自の種目として作成する</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
