'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import FatigueSelector from '@/components/record/FatigueSelector'
import SaveComplete from '@/components/ui/SaveComplete'
import type { CardioMaster, UserExercise } from '@/types'
import { todayLocalDate } from '@/lib/utils/date'
import { formatCardio, parseCardioInput, type CardioRecord } from '@/lib/record/cardio'
import CardioInputs, { type CardioInputValue } from '@/components/record/CardioInputs'

type Props = {
  exercise: UserExercise
  isBeforeWeekStart: boolean
  onBack: () => void
  setIsDirty: (dirty: boolean) => void
}

// 有酸素運動の記録（2026-10-26）。時間（分、必須）・距離（km、任意）・消費カロリー（kcal、任意）を1回分記録する。
// 重量・回数・セットは無く、自己ベストの判定もしない。記録画面（app/(app)/record/page.tsx）が有酸素の種目の時に出す
export default function CardioRecordForm({ exercise, isBeforeWeekStart, onBack, setIsDirty }: Props) {
  const router = useRouter()
  const [trainedAt, setTrainedAt] = useState(() => todayLocalDate())
  const [input, setInput] = useState<CardioInputValue>({ minutes: '', distanceKm: '', calories: '' })
  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [tracksDistance, setTracksDistance] = useState(true)
  const [previous, setPrevious] = useState<{ trainedAt: string; record: CardioRecord } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // 二重保存の防止（同じIDの再送は保存済みとして扱われる）
  const [clientId] = useState(() => crypto.randomUUID())

  // 距離の欄を出すか（一覧の種目の設定。自分で名前をつけた種目は出す）と、前回の記録
  useEffect(() => {
    if (exercise.cardio_master_id) {
      fetch('/api/exercises/master')
        .then(r => r.json())
        .then(d => {
          const master = (d.cardio as CardioMaster[] | undefined)?.find(c => c.id === exercise.cardio_master_id)
          if (master) setTracksDistance(master.tracks_distance)
        })
        .catch(() => {})
    }
    if (exercise.recent_session_ids.length > 0) {
      Promise.all(exercise.recent_session_ids.map(id => fetch(`/api/sessions/${id}`).then(r => (r.ok ? r.json() : null)).catch(() => null)))
        .then(results => {
          type Row = { exercise_id: string; duration_seconds: number | null; distance_km: number | null; calories_kcal: number | null }
          const found = results
            .map(r => r?.session as { trained_at: string; training_sets: Row[] } | undefined)
            .filter((s): s is { trained_at: string; training_sets: Row[] } => !!s)
            .map(s => ({ trainedAt: s.trained_at, row: s.training_sets.find(t => t.exercise_id === exercise.id && t.duration_seconds != null) }))
            .filter(s => s.row)
            .sort((a, b) => b.trainedAt.localeCompare(a.trainedAt))[0]
          if (found?.row) setPrevious({ trainedAt: found.trainedAt, record: found.row })
        })
    }
  }, [exercise])

  const parsed = parseCardioInput({ ...input, distanceKm: tracksDistance ? input.distanceKm : '' })

  const handleSave = async () => {
    setErrorMessage(null)
    if (!parsed) {
      setErrorMessage(input.minutes.trim() ? '入力した値を確認してください' : '時間を入力してください')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trained_at: trainedAt,
          fatigue_level: fatigueLevel,
          memo,
          sets: [{ exercise_id: exercise.id, set_number: 1, weight_kg: 0, reps: 0, rir: false, is_warmup: false, ...parsed }],
          is_early: isBeforeWeekStart,
          client_id: clientId,
        }),
      })
      if (!res.ok) throw new Error()
      try { sessionStorage.removeItem('auxlog_suggest_v1') } catch { /* ignore */ }
      setIsDirty(false)
      setSaved(true)
    } catch {
      setErrorMessage('保存できませんでした。通信状態を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-900 px-4 py-5 z-10 flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 -ml-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 min-w-0 text-base font-semibold text-black dark:text-white truncate">{exercise.name}</h1>
        <input
          type="date"
          value={trainedAt}
          max={todayLocalDate()}
          onChange={e => setTrainedAt(e.target.value)}
          className="text-base font-semibold text-black dark:text-white bg-transparent shrink-0 outline-none cursor-pointer"
        />
      </div>

      <div className="px-6 py-6 space-y-6 pb-32">
        {previous && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            前回（{previous.trainedAt.slice(5).replace('-', '/')}）: {formatCardio(previous.record)}
          </p>
        )}

        <CardioInputs
          value={input}
          onChange={v => { setInput(v); setIsDirty(true) }}
          tracksDistance={tracksDistance}
        />

        <div>
          <h2 className="text-xs font-semibold text-zinc-400 mb-3">消耗度</h2>
          <FatigueSelector value={fatigueLevel} onChange={setFatigueLevel} />
        </div>

        <div>
          <h2 className="text-xs font-semibold text-zinc-400 mb-2">メモ（任意）</h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="今日のコンディションや気づきなど"
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm resize-none outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
        </div>
      </div>

      <div
        className="fixed bottom-16 left-0 right-0 px-6 pb-4 bg-gradient-to-t from-white dark:from-black to-transparent pt-8"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-lg mx-auto block py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity shadow-lg"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        {errorMessage && <p className="text-center text-xs text-red-500 mt-2">{errorMessage}</p>}
      </div>

      {saved && <SaveComplete result="good_job" onDone={() => router.push('/')} />}
    </div>
  )
}
