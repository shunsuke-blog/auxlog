'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, X, Search } from 'lucide-react'
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

// id は user_exercises.id（記録ページで使用）、masterId は exercise_master.id
type ExtraExercise = { id: string | null; masterId: string | null; name: string }
type MasterExercise = { id: string; name: string; target_muscle: string }

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

  const [extraExercises, setExtraExercises] = useState<ExtraExercise[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [masterExercises, setMasterExercises] = useState<MasterExercise[]>([])
  // exercise_master.id → user_exercises.id のマップ
  const [masterToUserExId, setMasterToUserExId] = useState<Map<string, string>>(new Map())
  const [masterLoading, setMasterLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Day 切替時に追加種目をリロード
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`auxlog_extra_ex_day${selectedDay}`)
      setExtraExercises(saved ? JSON.parse(saved) : [])
    } catch {
      setExtraExercises([])
    }
    setShowAddForm(false)
    setSearchQuery('')
  }, [selectedDay])

  // 追加フォームを開いたとき、マスタ種目とユーザー種目を並列フェッチ
  useEffect(() => {
    if (!showAddForm || masterExercises.length > 0) return
    setMasterLoading(true)
    Promise.all([
      fetch('/api/exercises/master').then(r => r.json()),
      fetch('/api/exercises').then(r => r.json()),
    ])
      .then(([masterData, userExData]) => {
        setMasterExercises(masterData.exercises ?? [])
        // ユーザー種目の exercise_master_id → user_exercises.id マップを構築
        const map = new Map<string, string>()
        for (const ue of (userExData.exercises ?? [])) {
          if (ue.exercise_master_id) map.set(ue.exercise_master_id, ue.id)
        }
        setMasterToUserExId(map)
      })
      .catch(() => {})
      .finally(() => setMasterLoading(false))
  }, [showAddForm, masterExercises.length])

  const persistExtra = (list: ExtraExercise[]) => {
    try { sessionStorage.setItem(`auxlog_extra_ex_day${selectedDay}`, JSON.stringify(list)) } catch { /* ignore */ }
  }

  const addExercise = (ex: ExtraExercise) => {
    const updated = [...extraExercises, ex]
    setExtraExercises(updated)
    persistExtra(updated)
    setShowAddForm(false)
    setSearchQuery('')
  }

  const removeExercise = (index: number) => {
    const updated = extraExercises.filter((_, i) => i !== index)
    setExtraExercises(updated)
    persistExtra(updated)
  }

  const trimmedQuery = searchQuery.trim()
  const filteredMaster = trimmedQuery
    ? masterExercises.filter(e => e.name.includes(trimmedQuery))
    : masterExercises

  // すでに追加済み or プログラムスロットにある種目IDセット
  const addedNames = new Set(extraExercises.map(e => e.name))
  const slotNames = new Set(suggestion?.slots.map(s => s.exercise.name) ?? [])

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

            {/* 追加種目カード */}
            {extraExercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <Link
                  href={ex.id ? `/record?exerciseId=${ex.id}` : '/record'}
                  className="flex-1 block bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-600 px-5 pt-4 pb-5 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">追加種目</p>
                      <h3 className="text-[15px] font-bold text-black dark:text-white">{ex.name}</h3>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
                  </div>
                </Link>
                <button
                  onClick={() => removeExercise(i)}
                  className="p-2 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors shrink-0"
                  aria-label="削除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* 種目追加ボタン */}
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              種目を追加
            </button>
          </>
        )}
      </div>

      {/* 種目選択オーバーレイ */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-black">
          {/* ヘッダー */}
          <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-zinc-100 dark:border-zinc-900">
            <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="種目名で検索..."
                autoFocus
                className="flex-1 text-[15px] text-black dark:text-white bg-transparent placeholder:text-zinc-400 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-zinc-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => { setShowAddForm(false); setSearchQuery('') }}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 shrink-0"
            >
              キャンセル
            </button>
          </div>

          {/* リスト */}
          <div className="flex-1 overflow-y-auto">
            {masterLoading ? (
              <p className="text-sm text-zinc-400 text-center py-12">読み込み中...</p>
            ) : (
              <>
                {filteredMaster
                  .filter(e => !addedNames.has(e.name) && !slotNames.has(e.name))
                  .map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => addExercise({
                        // user_exercises.id を使う。未登録の場合は null（記録画面で種目なし遷移）
                        id: masterToUserExId.get(ex.id) ?? null,
                        masterId: ex.id,
                        name: ex.name,
                      })}
                      className="w-full flex items-center px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                    >
                      <span className="text-[15px] text-black dark:text-white">{ex.name}</span>
                    </button>
                  ))}

                {/* DBにない場合は自由入力で追加 */}
                {trimmedQuery && !filteredMaster.some(e => e.name === trimmedQuery) && (
                  <button
                    onClick={() => addExercise({ id: null, masterId: null, name: trimmedQuery })}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-[15px] text-zinc-500 dark:text-zinc-400">
                      「{trimmedQuery}」を追加する
                    </span>
                  </button>
                )}

                {!masterLoading && filteredMaster.length === 0 && !trimmedQuery && (
                  <p className="text-sm text-zinc-400 text-center py-12">種目が見つかりません</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
