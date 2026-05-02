'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import FatigueSelector from '@/components/record/FatigueSelector'
import SetRow, { type SetData } from '@/components/record/SetRow'
import { Plus, ChevronLeft, Trash2 } from 'lucide-react'

type ExerciseSets = {
  exerciseId: string
  exerciseName: string
  isBodyweight: boolean
  sets: SetData[]
}

function EditContent() {
  const router = useRouter()
  const { sessionId } = useParams<{ sessionId: string }>()

  const [trainedAt, setTrainedAt] = useState('')
  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [exerciseSets, setExerciseSets] = useState<ExerciseSets[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) { router.back(); return }

      const { session } = await res.json()
      setTrainedAt(session.trained_at)
      setFatigueLevel(session.fatigue_level)
      setMemo(session.memo ?? '')

      // sets を exercise_id でグループ化
      const grouped = new Map<string, ExerciseSets>()
      for (const set of session.training_sets ?? []) {
        const exId = set.exercise_id
        const exName = set.user_exercises?.custom_name
          ?? set.user_exercises?.exercise_master?.name
          ?? '不明な種目'

        const isBodyweight = set.user_exercises?.is_bodyweight ?? false

        if (!grouped.has(exId)) {
          grouped.set(exId, { exerciseId: exId, exerciseName: exName, isBodyweight, sets: [] })
        }
        grouped.get(exId)!.sets.push({
          set_number: set.set_number,
          weight_kg: String(set.weight_kg),
          reps: String(set.reps),
          rir: set.rir,
          is_warmup: set.is_warmup ?? false,
          done: true,
        })
      }

      // set_number でソート
      const result = Array.from(grouped.values()).map(ex => ({
        ...ex,
        sets: ex.sets.sort((a, b) => a.set_number - b.set_number),
      }))
      setExerciseSets(result)
      setLoading(false)
    }
    load()
  }, [sessionId, router])

  const updateSet = (exIdx: number, setIdx: number, data: SetData) => {
    setExerciseSets(prev => {
      const next = [...prev]
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s, i) => (i === setIdx ? data : s)),
      }
      return next
    })
  }

  const addSet = (exIdx: number) => {
    setExerciseSets(prev => {
      const next = [...prev]
      const lastSet = next[exIdx].sets[next[exIdx].sets.length - 1]
      next[exIdx] = {
        ...next[exIdx],
        sets: [
          ...next[exIdx].sets,
          {
            set_number: next[exIdx].sets.length + 1,
            weight_kg: lastSet.weight_kg,
            reps: lastSet.reps,
            rir: false,
            is_warmup: false,
            done: true,
          },
        ],
      }
      return next
    })
  }

  const deleteSet = (exIdx: number, setIdx: number) => {
    setExerciseSets(prev => {
      const next = [...prev]
      const newSets = next[exIdx].sets
        .filter((_, i) => i !== setIdx)
        .map((s, i) => ({ ...s, set_number: i + 1 }))
      next[exIdx] = { ...next[exIdx], sets: newSets }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)

    const sets = exerciseSets.flatMap(ex =>
      ex.sets
        .filter(s => s.weight_kg !== '' && s.reps !== '')
        .map(s => ({
          exercise_id: ex.exerciseId,
          set_number: s.set_number,
          weight_kg: parseFloat(s.weight_kg),
          reps: parseInt(s.reps),
          rir: s.rir,
          is_warmup: s.is_warmup,
        }))
    )

    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trained_at: trainedAt, fatigue_level: fatigueLevel, memo, sets }),
    })

    if (res.ok) {
      setToast('保存しました')
      setTimeout(() => router.push('/history'), 800)
    } else {
      setToast('保存に失敗しました。再試行してください')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('この記録を削除しますか？')) return
    setDeleting(true)
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/history')
    } else {
      setToast('削除に失敗しました')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black px-6 pt-14 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-zinc-50 dark:bg-zinc-950 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 py-4 z-10 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          className="p-1.5 -ml-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-black dark:text-white">記録を編集</h1>
        </div>
        <input
          type="date"
          value={trainedAt}
          max={new Date().toISOString().split('T')[0]}
          onChange={e => setTrainedAt(e.target.value)}
          className="text-sm text-zinc-500 dark:text-zinc-400 bg-transparent shrink-0 outline-none cursor-pointer"
        />
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-6 space-y-6 pb-40">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            疲労度
          </h2>
          <FatigueSelector value={fatigueLevel} onChange={setFatigueLevel} />
        </div>

        {exerciseSets.map((ex, exIdx) => (
          <div key={ex.exerciseId} className="space-y-3">
            <h2 className="text-base font-semibold text-black dark:text-white">
              {ex.exerciseName}
            </h2>
            <div className="space-y-2.5">
              {ex.sets.map((set, setIdx) => (
                <SetRow
                  key={setIdx}
                  setData={set}
                  canDelete={ex.sets.length > 1}
                  isBodyweight={ex.isBodyweight}
                  onChange={data => updateSet(exIdx, setIdx, data)}
                  onDelete={() => deleteSet(exIdx, setIdx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addSet(exIdx)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              セット追加
            </button>
          </div>
        ))}

        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            メモ（任意）
          </h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm resize-none outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-6 pb-4 bg-gradient-to-t from-white dark:from-black to-transparent pt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-lg mx-auto block py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity shadow-lg"
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

export default function EditSessionPage() {
  return (
    <Suspense>
      <EditContent />
    </Suspense>
  )
}
