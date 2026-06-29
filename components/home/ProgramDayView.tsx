'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, X } from 'lucide-react'
import type { UserProgramEnrollment, ProgramSuggestion, ProgramPhase } from '@/types'
import ProgramSlotCard from './ProgramSlotCard'

const PHASE_LABELS: Record<ProgramPhase, string> = {
  volume:    'ボリューム期',
  intensity: '強度期',
  deload:    '回復週',
  maxout:    'MaxOut',
}

const PHASE_DESCRIPTIONS: Record<ProgramPhase, string> = {
  volume:    'フォームを固め、体をプログラムに慣らす期間です。回数は少なめですが、丁寧な動作を意識しましょう。',
  intensity: '重量を高めて筋力を向上させる期間です。セット数は絞り、強度を上げます。',
  deload:    '積み上げた疲労を抜く回復週です。軽めに動かして体を整えてください。',
  maxout:    '9週間の集大成。限界まで全力を出し切り、自己ベスト更新を狙います！',
}


type Props = {
  enrollment: UserProgramEnrollment
  trialDaysLeft: number | null
}

export default function ProgramDayView({ enrollment, trialDaysLeft }: Props) {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })

  const [selectedDay, setSelectedDay] = useState(() => {
    try {
      const saved = sessionStorage.getItem('auxlog_program_day')
      const n = saved ? parseInt(saved, 10) : 1
      return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1
    } catch { return 1 }
  })
  const [suggestion, setSuggestion] = useState<ProgramSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extraExercises, setExtraExercises] = useState<string[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`auxlog_extra_ex_day${selectedDay}`)
      setExtraExercises(saved ? JSON.parse(saved) : [])
    } catch {
      setExtraExercises([])
    }
    setShowAddForm(false)
    setNewExerciseName('')
  }, [selectedDay])

  const addExercise = () => {
    const name = newExerciseName.trim()
    if (!name) return
    const updated = [...extraExercises, name]
    setExtraExercises(updated)
    try { sessionStorage.setItem(`auxlog_extra_ex_day${selectedDay}`, JSON.stringify(updated)) } catch { /* ignore */ }
    setNewExerciseName('')
    setShowAddForm(false)
  }

  const removeExercise = (index: number) => {
    const updated = extraExercises.filter((_, i) => i !== index)
    setExtraExercises(updated)
    try { sessionStorage.setItem(`auxlog_extra_ex_day${selectedDay}`, JSON.stringify(updated)) } catch { /* ignore */ }
  }

  const availableDays = Array.from({ length: enrollment.days_per_week }, (_, i) => i + 1)

  const fetchDay = useCallback(async (day: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/suggest/program?day=${day}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'エラーが発生しました')
      }
      const data = await res.json()
      setSuggestion(data.suggestion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDay(selectedDay)
  }, [selectedDay, fetchDay])

  return (
    <>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide">{today}</p>
        <div className="flex items-end justify-between mt-0.5">
          <h1 className="text-xl font-black text-black dark:text-white tracking-tight leading-tight">
            今日のメニュー
          </h1>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              Week {enrollment.current_week} / 9 · {PHASE_LABELS[suggestion?.phase ?? 'volume']}
            </p>
          </div>
        </div>
      </div>

      {/* トライアル終了バナー */}
      {trialDaysLeft !== null && trialDaysLeft <= 7 && trialDaysLeft > 0 && (
        <Link
          href="/settings/subscription"
          className={`mx-5 mt-4 flex items-center justify-between px-4 py-3 rounded-2xl ${
            trialDaysLeft <= 3
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-accent/10 border border-accent/30'
          }`}
        >
          <p className={`text-sm font-semibold ${trialDaysLeft <= 3 ? 'text-red-500' : 'text-accent'}`}>
            トライアルがあと{trialDaysLeft}日で終了します
          </p>
          <ChevronRight className={`w-4 h-4 shrink-0 ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-accent'}`} />
        </Link>
      )}

      {/* Day セレクター */}
      <div className="flex gap-2 px-5 pt-5 pb-2 overflow-x-auto scrollbar-none">
        {availableDays.map(day => {
          const isActive = day === selectedDay
          return (
            <button
              key={day}
              onClick={() => {
                setSelectedDay(day)
                try { sessionStorage.setItem('auxlog_program_day', String(day)) } catch { /* ignore */ }
              }}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              Day {day}
            </button>
          )
        })}
      </div>

      {/* 今週のフォーカス */}
      {suggestion && (
        <div className="mx-5 mt-1 mb-0 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
            今週のフォーカス
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {PHASE_DESCRIPTIONS[suggestion.phase]}
          </p>
        </div>
      )}

      {/* コンテンツ */}
      <div className="px-5 py-4 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-3xl bg-zinc-100 dark:bg-zinc-900 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-zinc-400 dark:text-zinc-600">{error}</p>
          </div>
        ) : !suggestion || suggestion.slots.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-4xl">🎉</p>
            <p className="text-base font-semibold text-black dark:text-white">
              このDayは除外されています
            </p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              別のDayを選んでください
            </p>
          </div>
        ) : (
          <>
            {suggestion.slots.map(slot => (
              <ProgramSlotCard key={slot.slot_id} slot={slot} />
            ))}

            {/* 追加種目 */}
            {extraExercises.map((name, i) => (
              <div key={i} className="relative">
                <Link
                  href="/record"
                  className="block bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-600 px-5 pt-4 pb-5 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">追加種目</p>
                      <h3 className="text-[15px] font-bold text-black dark:text-white">{name}</h3>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
                  </div>
                </Link>
                <button
                  onClick={() => removeExercise(i)}
                  className="absolute top-3 right-10 p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
                  aria-label="削除"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* 種目追加フォーム or ボタン */}
            {showAddForm ? (
              <div className="flex items-center gap-2 px-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={newExerciseName}
                  onChange={e => setNewExerciseName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addExercise() }}
                  placeholder="種目名を入力"
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-black dark:focus:border-white"
                />
                <button
                  onClick={addExercise}
                  disabled={!newExerciseName.trim()}
                  className="px-4 py-3 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity shrink-0"
                >
                  追加
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewExerciseName('') }}
                  className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                種目を追加
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}
