'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FatigueSelector from '@/components/record/FatigueSelector'
import SetRow, { type SetData } from '@/components/record/SetRow'
import CircleCheck from '@/components/ui/CircleCheck'
import { Plus, ChevronLeft } from 'lucide-react'
import type { UserExercise, Suggestion, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { todayLocalDate } from '@/lib/utils/date'
import { useToast } from '@/hooks/useToast'
import Toast from '@/components/ui/Toast'

type ExerciseSets = {
  exercise: UserExercise
  sets: SetData[]
  enabled: boolean  // 記録タブからの全種目表示時のみ使用
}

// `done: false` 付きでセットを初期化するヘルパー
const makeSet = (partial: Omit<SetData, 'done'>): SetData => ({ ...partial, done: false })

function RecordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const exerciseId = searchParams.get('exerciseId')
  // ホームカードから来た場合は exerciseId あり → CircleCheck 不要
  const fromHome = exerciseId !== null

  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [exerciseSets, setExerciseSets] = useState<ExerciseSets[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [exerciseName, setExerciseName] = useState('')
  const [trainedAt, setTrainedAt] = useState(() => todayLocalDate())

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/suggest')
      const data = await res.json()
      const allSuggestions: Suggestion[] = data.suggestions ?? []

      // ホームでスワイプ削除した種目を非表示（exerciseId 未指定の全種目表示時のみ適用）
      const suggestions = exerciseId ? allSuggestions : (() => {
        try {
          const stored = sessionStorage.getItem('auxlog_hidden_today')
          if (!stored) return allSuggestions
          const { date, ids } = JSON.parse(stored) as { date: string; ids: string[] }
          const today = todayLocalDate()
          if (date !== today) return allSuggestions
          return allSuggestions.filter(s => !ids.includes(s.exercise.id))
        } catch { return allSuggestions }
      })()

      if (exerciseId) {
        const matched = suggestions.find(s => s.exercise.id === exerciseId)

        if (matched) {
          setExerciseSets([{
            exercise: matched.exercise,
            enabled: true,
            sets: matched.proposed_set_targets.map(t => makeSet({
              set_number: t.set_number,
              weight_kg: t.weight_kg > 0 ? String(t.weight_kg) : '',
              reps: String(t.reps),
              rir: false,
              is_warmup: t.is_warmup,
            })),
          }])
          setExerciseName(matched.exercise.name)
        } else {
          const exRes = await fetch('/api/exercises')
          const exData = await exRes.json()
          const ex: UserExercise | undefined = (exData.exercises ?? []).find(
            (e: UserExercise) => e.id === exerciseId
          )
          if (ex) {
            setExerciseSets([{
              exercise: ex,
              enabled: true,
              sets: Array.from({ length: ex.default_sets }, (_, i) => makeSet({
                set_number: i + 1,
                weight_kg: '',
                reps: String(Math.max(1, ex.default_reps - i)),
                rir: false,
                is_warmup: false,
              })),
            }])
            setExerciseName(ex.name)
          }
        }
      } else if (suggestions.length > 0) {
        setExerciseSets(
          suggestions.map(s => ({
            exercise: s.exercise,
            enabled: true,
            sets: s.proposed_set_targets.map(t => makeSet({
              set_number: t.set_number,
              weight_kg: t.weight_kg > 0 ? String(t.weight_kg) : '',
              reps: String(t.reps),
              rir: false,
              is_warmup: t.is_warmup,
            })),
          }))
        )
      } else {
        const exRes = await fetch('/api/exercises')
        const exData = await exRes.json()
        const allExercises: UserExercise[] = exData.exercises ?? []
        setExerciseSets(
          allExercises.map(ex => ({
            exercise: ex,
            enabled: true,
            sets: Array.from({ length: ex.default_sets }, (_, i) => makeSet({
              set_number: i + 1,
              weight_kg: '',
              reps: String(Math.max(1, ex.default_reps - i)),
              rir: false,
              is_warmup: false,
            })),
          }))
        )
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
          makeSet({
            set_number: next[exIdx].sets.length + 1,
            weight_kg: lastSet.weight_kg,
            reps: lastSet.reps,
            rir: false,
            is_warmup: false,
          }),
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
      .filter(ex => fromHome || ex.enabled)   // ホームから: 常に含む / タブから: enabled のみ
      .flatMap(ex =>
        ex.sets
          .filter(s => s.done)                // 実施フラグが立っているセットのみ保存
          .map(s => ({
            exercise_id: ex.exercise.id,
            set_number: s.set_number,
            weight_kg: s.weight_kg === '' ? 0 : parseFloat(s.weight_kg),
            reps: parseInt(s.reps),
            rir: s.rir,
            is_warmup: s.is_warmup,
          }))
      )

    setErrorMessage(null)

    if (sets.length === 0) {
      setErrorMessage('実施済みのセットがありません')
      setSaving(false)
      return
    }

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trained_at: trainedAt, fatigue_level: fatigueLevel, memo, sets }),
    })

    if (res.ok) {
      showToast('保存しました')
      setTimeout(() => router.push('/'), 800)
    } else {
      setErrorMessage('保存に失敗しました。再試行してください')
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
          max={todayLocalDate()}
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

        {(() => {
          // 部位ごとにグループ化して表示（ホームからの単一種目表示時はグループなし）
          const muscleOrder: TargetMuscle[] = ['chest', 'back', 'legs', 'shoulders', 'arms']
          const showGroupHeader = !fromHome && exerciseSets.length > 1

          // 部位グループを生成
          const groups = showGroupHeader
            ? muscleOrder
                .map(muscle => ({
                  muscle,
                  items: exerciseSets
                    .map((ex, idx) => ({ ex, idx }))
                    .filter(({ ex }) => ex.exercise.target_muscle === muscle),
                }))
                .filter(g => g.items.length > 0)
            : [{ muscle: null, items: exerciseSets.map((ex, idx) => ({ ex, idx })) }]

          return groups.map(({ muscle, items }) => (
            <div key={muscle ?? 'all'}>
              {muscle && (
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 mt-2">
                  {TARGET_MUSCLE_LABELS[muscle]}
                </h3>
              )}
              <div className="space-y-6">
                {items.map(({ ex, idx: exIdx }) => {
          const showCircle = !fromHome
          const isVisible = fromHome || ex.enabled
          const workingSets = ex.sets.filter(s => !s.is_warmup)
          const allDone = workingSets.length > 0 && workingSets.every(s => s.done)

          return (
            <div key={ex.exercise.id} className={`space-y-3 transition-opacity ${isVisible ? 'opacity-100' : 'opacity-30'}`}>
              <div className="flex items-center gap-3">
                {showCircle && (
                  <CircleCheck
                    checked={ex.enabled}
                    onChange={v => toggleEnabled(exIdx, v)}
                  />
                )}
                <h2 className="text-base font-semibold text-black dark:text-white">
                  {ex.exercise.name}
                </h2>
                {allDone && (
                  <span className="text-xs font-bold text-emerald-500 animate-pulse">
                    GOOD!
                  </span>
                )}
              </div>
              {isVisible && (
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
          )
        })}
              </div>
            </div>
          ))
        })()}

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

      <div className="fixed bottom-16 left-0 right-0 px-6 pb-4 bg-gradient-to-t from-white dark:from-black to-transparent pt-8"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-lg mx-auto block py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity shadow-lg"
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        {errorMessage && (
          <p className="text-center text-xs text-red-500 mt-2">{errorMessage}</p>
        )}
      </div>

      <Toast message={toast} />
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
