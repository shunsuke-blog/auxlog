'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FatigueSelector from '@/components/record/FatigueSelector'
import SetRow, { type SetData } from '@/components/record/SetRow'
import CircleCheck from '@/components/ui/CircleCheck'
import { Plus, ChevronLeft } from 'lucide-react'
import type { UserExercise, Suggestion } from '@/types'

type ExerciseSets = {
  exercise: UserExercise
  sets: SetData[]
  enabled: boolean
}

function RecordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const exerciseId = searchParams.get('exerciseId')

  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [exerciseSets, setExerciseSets] = useState<ExerciseSets[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exerciseName, setExerciseName] = useState('')
  const [trainedAt, setTrainedAt] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/suggest')
      const data = await res.json()
      const suggestions: Suggestion[] = data.suggestions ?? []

      if (suggestions.length > 0) {
        // exerciseId が指定されている場合はその1種目だけ表示
        const filtered = exerciseId
          ? suggestions.filter(s => s.exercise.id === exerciseId)
          : suggestions

        const target = filtered.length > 0 ? filtered : suggestions

        setExerciseSets(
          target.map(s => ({
            exercise: s.exercise,
            enabled: true,
            sets: s.proposed_set_targets.map(t => ({
              set_number: t.set_number,
              weight_kg: t.weight_kg > 0 ? String(t.weight_kg) : '',
              reps: String(t.reps),
              rir: true,
              is_warmup: t.is_warmup,
            })),
          }))
        )
        if (exerciseId && filtered.length > 0) {
          setExerciseName(filtered[0].exercise.name)
        }
      } else {
        const exRes = await fetch('/api/exercises')
        const exData = await exRes.json()
        const allExercises: UserExercise[] = exData.exercises ?? []
        const filtered = exerciseId
          ? allExercises.filter(ex => ex.id === exerciseId)
          : allExercises

        setExerciseSets(
          filtered.map(ex => ({
            exercise: ex,
            enabled: true,
            sets: [{ set_number: 1, weight_kg: '', reps: String(ex.default_reps), rir: true, is_warmup: false }],
          }))
        )
        if (exerciseId && filtered.length > 0) {
          setExerciseName(filtered[0].name)
        }
      }
      setLoading(false)
    }
    load()
  }, [exerciseId])

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
            rir: true,
            is_warmup: false,
          },
        ],
      }
      return next
    })
  }

  const toggleEnabled = (exIdx: number, value: boolean) => {
    setExerciseSets(prev => {
      const next = [...prev]
      next[exIdx] = { ...next[exIdx], enabled: value }
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

    const sets = exerciseSets
      .filter(ex => ex.enabled)
      .flatMap(ex =>
        ex.sets
          .filter(s => s.reps !== '' && (ex.exercise.is_bodyweight || s.weight_kg !== ''))
          .map(s => ({
            exercise_id: ex.exercise.id,
            set_number: s.set_number,
            weight_kg: s.weight_kg === '' ? 0 : parseFloat(s.weight_kg),
            reps: parseInt(s.reps),
            rir: s.rir,
            is_warmup: s.is_warmup,
          }))
      )

    if (sets.length === 0) {
      setSaving(false)
      return
    }

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trained_at: trainedAt, fatigue_level: fatigueLevel, memo, sets }),
    })

    if (res.ok) {
      setToast('保存しました')
      setTimeout(() => router.push('/'), 800)
    } else {
      setToast('保存に失敗しました。再試行してください')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black px-6 pt-14 space-y-4">
        {[1, 2].map(i => (
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
          <h1 className="text-base font-semibold text-black dark:text-white truncate">
            {exerciseName || '記録入力'}
          </h1>
        </div>
        <input
          type="date"
          value={trainedAt}
          max={new Date().toISOString().split('T')[0]}
          onChange={e => setTrainedAt(e.target.value)}
          className="text-sm text-zinc-500 dark:text-zinc-400 bg-transparent shrink-0 outline-none cursor-pointer"
        />
      </div>

      <div className="px-6 py-6 space-y-6 pb-40">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            疲労度
          </h2>
          <FatigueSelector value={fatigueLevel} onChange={setFatigueLevel} />
        </div>

        {exerciseSets.map((ex, exIdx) => (
          <div key={ex.exercise.id} className={`space-y-3 transition-opacity ${ex.enabled ? 'opacity-100' : 'opacity-30'}`}>
            <div className="flex items-center gap-3">
              <CircleCheck
                checked={ex.enabled}
                onChange={v => toggleEnabled(exIdx, v)}
              />
              <h2 className="text-base font-semibold text-black dark:text-white">
                {ex.exercise.name}
              </h2>
            </div>
            {ex.enabled && (
              <>
                <div className="space-y-2.5">
                  {ex.sets.map((set, setIdx) => (
                    <SetRow
                      key={setIdx}
                      setData={set}
                      canDelete={ex.sets.length > 1}
                      isBodyweight={ex.exercise.is_bodyweight}
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
              </>
            )}
          </div>
        ))}

        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            メモ（任意）
          </h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="今日のコンディションや気づきなど"
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

export default function RecordPage() {
  return (
    <Suspense>
      <RecordContent />
    </Suspense>
  )
}
