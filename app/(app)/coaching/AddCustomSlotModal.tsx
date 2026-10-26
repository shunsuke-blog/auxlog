'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Plus, Search, X } from 'lucide-react'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'

type MasterExercise = { id: string; name: string; target_muscle: string }

type Props = {
  day: number
  onAdded: () => void
  onClose: () => void
}

// 種目情報の各Dayから、週次進行計算される種目（カスタムスロット）を追加するモーダル。
// ホームの「種目を追加」（その週だけ）と違い、部位の選択が必須の1段階目にある
// （この部位がカスタムスロットに保存され、ホーム画面の表示にも使われるため）。
// モバイル版 add-custom-slot-modal.tsx の移植。
export default function AddCustomSlotModal({ day, onAdded, onClose }: Props) {
  const [muscle, setMuscle] = useState<TargetMuscle | null>(null)
  const [query, setQuery] = useState('')
  const [master, setMaster] = useState<MasterExercise[]>([])
  const [masterToUserExId, setMasterToUserExId] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/exercises/master').then(r => r.json()),
      fetch('/api/exercises').then(r => r.json()),
    ])
      .then(([masterData, userExData]) => {
        setMaster(masterData.exercises ?? [])
        const map = new Map<string, string>()
        for (const ue of (userExData.exercises ?? [])) {
          if (ue.exercise_master_id) map.set(ue.exercise_master_id, ue.id)
        }
        setMasterToUserExId(map)
      })
      .catch(() => setError('種目の読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  // 追加処理中に閉じられると「反応がない」ように見えるため、完了するまで閉じさせない
  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const trimmedQuery = query.trim()
  const filtered = muscle
    ? (trimmedQuery ? master.filter(e => e.name.includes(trimmedQuery)) : master).filter(e => e.target_muscle === muscle)
    : []

  const createUserExercise = async (body: Record<string, unknown>): Promise<string> => {
    const res = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    const id = (data as { exercise?: { id?: string } }).exercise?.id
    if (!res.ok || !id) throw new Error((data as { error?: string }).error ?? '種目の追加に失敗しました')
    return id
  }

  const addSlot = async (resolveExerciseId: () => Promise<string>) => {
    if (!muscle) return
    setSubmitting(true)
    setError(null)
    try {
      const exerciseId = await resolveExerciseId()
      const res = await fetch('/api/program/custom-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: exerciseId, day_number: day, muscle_group: muscle }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '種目の追加に失敗しました。もう一度お試しください')
      }
      onAdded()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '種目の追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddMaster = (ex: MasterExercise) =>
    addSlot(async () => masterToUserExId.get(ex.id) ?? createUserExercise({ exercise_master_id: ex.id }))

  const handleAddCustom = () =>
    addSlot(() => createUserExercise({ custom_name: trimmedQuery, custom_target_muscle: muscle, is_compound: false }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-black">
      <div className="flex items-center justify-between gap-3 px-5 pt-14 pb-4 border-b border-zinc-100 dark:border-zinc-900">
        {muscle ? (
          <button
            onClick={() => setMuscle(null)}
            disabled={submitting}
            className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            {TARGET_MUSCLE_LABELS[muscle]}
          </button>
        ) : (
          <p className="text-sm font-semibold text-black dark:text-white">Day {day} に追加する部位を選択</p>
        )}
        <button
          onClick={handleClose}
          disabled={submitting}
          className="text-sm font-medium text-zinc-500 dark:text-zinc-400 shrink-0 disabled:opacity-50"
        >
          キャンセル
        </button>
      </div>

      {error && <p className="px-5 pt-3 text-sm text-red-500 text-center">{error}</p>}

      {!muscle ? (
        <div className="grid grid-cols-2 gap-2 p-5">
          {MUSCLE_ORDER.map(m => (
            <button
              key={m}
              onClick={() => setMuscle(m)}
              className="py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-semibold text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              {TARGET_MUSCLE_LABELS[m]}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-900">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="種目名で検索…"
                autoFocus
                disabled={submitting}
                className="flex-1 text-[15px] text-black dark:text-white bg-transparent placeholder:text-zinc-400 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-zinc-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-zinc-400 text-center py-12">読み込み中…</p>
            ) : submitting ? (
              <p className="text-sm text-zinc-400 text-center py-12">追加中…</p>
            ) : (
              <>
                {filtered.map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => handleAddMaster(ex)}
                    className="w-full flex items-center px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                  >
                    <span className="text-[15px] text-black dark:text-white">{ex.name}</span>
                  </button>
                ))}

                {trimmedQuery && !filtered.some(e => e.name === trimmedQuery) && (
                  <button
                    onClick={handleAddCustom}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-[15px] text-zinc-500 dark:text-zinc-400">「{trimmedQuery}」を追加する</span>
                  </button>
                )}

                {filtered.length === 0 && !trimmedQuery && (
                  <p className="text-sm text-zinc-400 text-center py-12">種目が見つかりません</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
