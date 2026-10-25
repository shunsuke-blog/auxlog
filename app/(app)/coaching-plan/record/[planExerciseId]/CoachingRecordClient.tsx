'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus } from 'lucide-react'
import SetRow, { type SetData } from '@/components/record/SetRow'
import FatigueSelector from '@/components/record/FatigueSelector'
import SaveComplete from '@/components/ui/SaveComplete'
import { useNavigationGuard } from '@/lib/contexts/NavigationGuard'
import { todayLocalDate } from '@/lib/utils/date'

export type PrefillSet = {
  setNumber: number
  /** null = トレーナーの指定なし・前回記録もなし（自分で入力） */
  weightKg: number | null
  weightIsTarget: boolean
  reps: number
  rir: number | null
  isWarmup: boolean
}

type Props = {
  planExerciseId: string
  name: string
  note: string | null
  day: number
  isBodyweight: boolean
  prefill: PrefillSet[]
  alreadyRecorded: boolean
}

// コーチングモードの1種目の記録。プランの目標セットを初期値にして、実際の重量・回数を記録する。
// 保存した記録はプランの種目（plan_exercise_id）と紐付き、トレーナーの画面に反映される。
export default function CoachingRecordClient({ planExerciseId, name, note, day, isBodyweight, prefill, alreadyRecorded }: Props) {
  const router = useRouter()
  const { setIsDirty } = useNavigationGuard()
  const [sets, setSets] = useState<SetData[]>(() =>
    prefill.map((s, i) => ({
      set_number: i + 1,
      weight_kg: s.weightKg != null ? String(s.weightKg) : '',
      reps: String(s.reps),
      // RIR0（限界まで）を指定されたセットは「限界」、それ以外は「余裕」を初期値にする
      rir: s.rir !== 0,
      is_warmup: s.isWarmup,
      done: false,
    })),
  )
  const [fatigueLevel, setFatigueLevel] = useState(3)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<'record' | 'volume_up' | 'good_job' | null>(null)

  const updateSet = (i: number, data: SetData) => {
    setSets(prev => prev.map((s, j) => (j === i ? data : s)))
    if (data.done) setIsDirty(true)
  }
  const deleteSet = (i: number) => setSets(prev => prev.filter((_, j) => j !== i).map((s, j) => ({ ...s, set_number: j + 1 })))
  const addSet = () =>
    setSets(prev => {
      const last = prev[prev.length - 1]
      return [...prev, { set_number: prev.length + 1, weight_kg: last?.weight_kg ?? '', reps: last?.reps ?? '', rir: true, is_warmup: false, done: false }]
    })

  const doneSets = sets.filter(s => s.done && s.reps !== '' && parseInt(s.reps) > 0)

  const save = async () => {
    if (doneSets.length === 0) {
      setError('実施したセットにチェックを入れてください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const linkRes = await fetch(`/api/coaching-plan/exercises/${planExerciseId}/link`, { method: 'POST' })
      const linkData = await linkRes.json().catch(() => ({}))
      if (!linkRes.ok) throw new Error((linkData as { error?: string }).error ?? '保存に失敗しました')
      const exerciseId = (linkData as { user_exercise_id: string }).user_exercise_id

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trained_at: todayLocalDate(),
          fatigue_level: fatigueLevel,
          memo,
          sets: doneSets.map((s, i) => ({
            exercise_id: exerciseId,
            set_number: i + 1,
            weight_kg: s.weight_kg === '' ? 0 : parseFloat(s.weight_kg),
            reps: parseInt(s.reps),
            rir: s.rir,
            is_warmup: s.is_warmup,
            plan_exercise_id: planExerciseId,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '保存に失敗しました')
      setIsDirty(false)
      const result = data as { is_improved?: boolean; is_volume_up?: boolean }
      setSaveResult(result.is_improved ? 'record' : result.is_volume_up ? 'volume_up' : 'good_job')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black pb-48">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5">
        {/* アプリと同じく「← 種目名」だけにする（2026-10-25） */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(`/?day=${day}`)} aria-label="ホームに戻る" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-black dark:text-white truncate">{name}</h1>
        </div>
      </div>

      {alreadyRecorded ? (
        <div className="px-6 py-8 space-y-3">
          <p className="text-sm font-semibold text-black dark:text-white">この種目は記録済みです</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">記録の修正は履歴から行えます。</p>
          <Link href="/history" className="inline-block px-5 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold">
            履歴を見る
          </Link>
        </div>
      ) : (
        <div className="px-6 py-6 space-y-6 max-w-lg">
          {note && (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">トレーナーからのメモ</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{note}</p>
            </div>
          )}

          <div className="space-y-3">
            {sets.map((s, i) => (
              <div key={i}>
                {/* 目標の回数・重量は入力欄に最初から入っているので、上に目標は書かない（2026-10-25） */}
                <SetRow
                  setData={s}
                  canDelete={sets.length > 1}
                  isBodyweight={isBodyweight}
                  onChange={data => updateSet(i, data)}
                  onDelete={() => deleteSet(i)}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addSet}
              className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              セット追加
            </button>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">消耗度</h2>
            <FatigueSelector value={fatigueLevel} onChange={setFatigueLevel} />
          </div>

          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">メモ（任意）</h2>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="今日のコンディションや気づきなど（トレーナーも見られます）"
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm resize-none outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
            />
          </div>
        </div>
      )}

      {!alreadyRecorded && (
        <div
          className="fixed left-0 right-0 px-6 pb-4 bg-gradient-to-t from-white dark:from-black to-transparent pt-8"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={save}
            disabled={saving}
            className="w-full max-w-lg mx-auto block py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity shadow-lg"
          >
            {saving ? '保存中...' : '保存する'}
          </button>
          {error && <p className="text-center text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {saveResult && (
        <SaveComplete
          result={saveResult}
          onDone={() => {
            router.push(`/?day=${day}`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
