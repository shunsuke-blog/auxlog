'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FatigueSelector from '@/components/record/FatigueSelector'
import SetRow, { type SetData } from '@/components/record/SetRow'
import CircleCheck from '@/components/ui/CircleCheck'
import { Plus, ChevronLeft, X } from 'lucide-react'
import type { UserExercise, Suggestion, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { todayLocalDate } from '@/lib/utils/date'
import SaveComplete from '@/components/ui/SaveComplete'
import { useNavigationGuard } from '@/lib/contexts/NavigationGuard'

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

  const { setIsDirty, guardedPush } = useNavigationGuard()

  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [exerciseSets, setExerciseSets] = useState<ExerciseSets[]>([])
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'record' | 'volume_up' | 'good_job' | null>(null)
  const [pendingSets, setPendingSets] = useState<ReturnType<typeof buildSets> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [prevBests, setPrevBests] = useState<Record<string, { weight: number; reps: number; volume: number; totalReps: number }>>({})
  const [loading, setLoading] = useState(true)
  const [exerciseName, setExerciseName] = useState('')
  const [trainedAt, setTrainedAt] = useState(() => todayLocalDate())
  const [allAvailableExercises, setAllAvailableExercises] = useState<UserExercise[]>([])
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    const load = async () => {
      const SUGGEST_CACHE_KEY = 'auxlog_suggest_v1'
      const SUGGEST_TTL = 5 * 60 * 1000

      const getSuggestData = async () => {
        try {
          const raw = sessionStorage.getItem(SUGGEST_CACHE_KEY)
          if (raw) {
            const { data, ts } = JSON.parse(raw)
            if (Date.now() - ts < SUGGEST_TTL) return data
          }
        } catch { /* ignore */ }
        const res = await fetch('/api/suggest')
        const data = await res.json()
        try {
          sessionStorage.setItem(SUGGEST_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
        } catch { /* ignore */ }
        return data
      }

      const [data, exercisesRes] = await Promise.all([
        getSuggestData(),
        fetch('/api/exercises'),
      ])
      const { exercises: fetchedExercises } = await exercisesRes.json()
      setAllAvailableExercises(fetchedExercises ?? [])
      const allSuggestions: Suggestion[] = data.suggestions ?? []

      // 前回ベストデータを種目IDでマップ化（リアルタイムバッジ判定用）
      const bestMap: Record<string, { weight: number; reps: number; volume: number; totalReps: number }> = {}
      for (const s of allSuggestions) {
        bestMap[s.exercise.id] = { weight: s.prev_best_weight_kg, reps: s.prev_best_reps, volume: s.prev_volume, totalReps: s.prev_total_reps }
      }
      setPrevBests(bestMap)

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
    if (data.done) setIsDirty(true)
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

  const addExercise = (exercise: UserExercise) => {
    setExerciseSets(prev => [...prev, {
      exercise,
      enabled: true,
      sets: [makeSet({
        set_number: 1,
        weight_kg: '',
        reps: String(exercise.default_reps),
        rir: false,
        is_warmup: false,
      })],
    }])
    setShowAddModal(false)
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

  const buildSets = () =>
    exerciseSets
      .filter(ex => fromHome || ex.enabled)
      .flatMap(ex =>
        ex.sets
          .filter(s => s.done)
          .map(s => ({
            exercise_id: ex.exercise.id,
            set_number: s.set_number,
            weight_kg: s.weight_kg === '' ? 0 : parseFloat(s.weight_kg),
            reps: parseInt(s.reps),
            rir: s.rir,
            is_warmup: s.is_warmup,
          }))
      )

  const handleSave = () => {
    setErrorMessage(null)
    const sets = buildSets()

    if (sets.length === 0) {
      setErrorMessage('実施済みのセットがありません')
      return
    }

    const undoneCount = exerciseSets
      .filter(ex => fromHome || ex.enabled)
      .flatMap(ex => ex.sets)
      .filter(s => !s.done).length

    if (undoneCount > 0) {
      setPendingSets(sets)
      return
    }

    executeSave(sets)
  }

  const executeSave = async (sets: ReturnType<typeof buildSets>) => {
    setSaving(true)
    setPendingSets(null)

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trained_at: trainedAt, fatigue_level: fatigueLevel, memo, sets }),
    })

    if (res.ok) {
      const data = await res.json()
      try { sessionStorage.removeItem('auxlog_suggest_v1') } catch { /* ignore */ }
      setIsDirty(false)
      setSaveResult(data.is_improved ? 'record' : data.is_volume_up ? 'volume_up' : 'good_job')
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
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 py-5 z-10 flex items-center gap-2">
        <button
          onClick={() => guardedPush('/')}
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
          className="text-base font-semibold text-black dark:text-white bg-transparent shrink-0 outline-none cursor-pointer"
        />
      </div>

      <div className="px-6 py-6 space-y-6 pb-40">
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
                <div className="mt-2 mb-4">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    {TARGET_MUSCLE_LABELS[muscle]}
                  </h3>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-800" />
                </div>
              )}
              <div className="space-y-6">
                {items.map(({ ex, idx: exIdx }) => {
          const showCircle = !fromHome
          const isVisible = fromHome || ex.enabled
          const workingSets = ex.sets.filter(s => !s.is_warmup)
          const allDone = workingSets.length > 0 && workingSets.every(s => s.done)

          // 全ワーキングセット完了時に前回ベストと比較してバッジを決定
          const badge = (() => {
            if (!allDone) return null
            const doneWorking = workingSets.filter(s => s.done)
            if (doneWorking.length === 0) return 'done' as const
            const prev = prevBests[ex.exercise.id]
            if (!prev || prev.weight === 0) return 'done' as const
            const currWeight = Math.max(...doneWorking.map(s => s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)))
            const currReps = Math.max(...doneWorking
              .filter(s => (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)) === currWeight)
              .map(s => parseInt(s.reps) || 0))
            const currVolume = doneWorking.reduce((sum, s) =>
              sum + (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)) * (parseInt(s.reps) || 0), 0)
            if (currWeight > prev.weight || (currWeight === prev.weight && currReps > prev.reps)) return 'record' as const
            if (currVolume > prev.volume) return 'volume_up' as const
            return 'done' as const
          })()

          const doneSets = ex.sets.filter(s => s.done)
          const doneWeightSum = doneSets.reduce((sum, s) => sum + (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)), 0)
          const doneVolume = doneSets
            .filter(s => !s.is_warmup)
            .reduce((sum, s) => sum + (s.weight_kg === '' ? 0 : parseFloat(s.weight_kg)) * (parseInt(s.reps) || 0), 0)
          const doneTotalReps = doneSets.reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0)
          // 加重なしの自重種目はボリューム（kg）が常に0になるため総回数で比較する
          const isBodyweightNoLoad = ex.exercise.is_bodyweight && doneWeightSum === 0

          return (
            <div key={ex.exercise.id} className={`space-y-3 transition-opacity ${isVisible ? 'opacity-100' : 'opacity-30'}`}>
              <div className="flex items-center gap-3">
                {showCircle && (
                  <CircleCheck
                    checked={ex.enabled}
                    onChange={v => toggleEnabled(exIdx, v)}
                  />
                )}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <h2 className="text-base font-semibold text-black dark:text-white truncate">
                    {ex.exercise.name}
                  </h2>
                  {badge && (
                    <span className={`text-xs font-bold animate-pulse shrink-0 ${
                      badge === 'record' ? 'text-amber-400' : 'text-emerald-500'
                    }`}>
                      {badge === 'record' ? 'Record!' : badge === 'volume_up' ? 'Vol Up!' : 'GOOD!'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400 tabular-nums shrink-0">
                  {isBodyweightNoLoad
                    ? `${(prevBests[ex.exercise.id]?.totalReps ?? 0).toLocaleString()}回 ▶︎ ${doneTotalReps.toLocaleString()}回`
                    : `${Math.round(prevBests[ex.exercise.id]?.volume ?? 0).toLocaleString()}kg ▶︎ ${Math.round(doneVolume).toLocaleString()}kg`}
                </span>
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

        {/* タブから開いた全体記録時のみ種目追加ボタンを表示 */}
        {!fromHome && (
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-400 dark:text-zinc-500 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            種目を追加
          </button>
        )}

        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            消耗度
          </h2>
          <FatigueSelector value={fatigueLevel} onChange={setFatigueLevel} />
        </div>

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

      {/* 種目追加モーダル */}
      {showAddModal && (() => {
        const addable = allAvailableExercises.filter(
          ex => !exerciseSets.some(es => es.exercise.id === ex.id)
        )
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddModal(false)} />
            <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
                <h2 className="text-base font-semibold text-black dark:text-white">種目を追加</h2>
                <button onClick={() => setShowAddModal(false)}>
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-6 py-4">
                {addable.length === 0 ? (
                  <p className="text-center py-10 text-sm text-zinc-400">追加できる種目がありません</p>
                ) : (
                  <div className="space-y-2">
                    {addable.map(ex => (
                      <button
                        key={ex.id}
                        onClick={() => addExercise(ex)}
                        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <span className="text-sm font-medium text-black dark:text-white">{ex.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ウォームアップ未記録の警告モーダル */}
      {pendingSets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPendingSets(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">未実施のセットがあります</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              チェックが入っていないセットは保存されません。このまま保存しますか？
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPendingSets(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white"
              >
                戻る
              </button>
              <button
                onClick={() => executeSave(pendingSets)}
                className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black"
              >
                このまま保存
              </button>
            </div>
          </div>
        </div>
      )}

      {saveResult && <SaveComplete result={saveResult} onDone={() => router.push('/')} />}
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
