'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, CheckCircle2, Plus, X, Search } from 'lucide-react'
import type { UserProgramEnrollment, ProgramSuggestion, ProgramPhase, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import ProgramSlotCard from './ProgramSlotCard'

function SwipeableCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const baseOffset = useRef(0)
  const swiping = useRef(false)
  const swipedThisTouch = useRef(false)
  const REVEAL = 80

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    baseOffset.current = offset
    swiping.current = false
    swipedThisTouch.current = false
    setAnimating(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (!swiping.current) {
      if (Math.abs(dy) > Math.abs(dx)) return
      if (Math.abs(dx) < 5) return
      swiping.current = true
    }
    swipedThisTouch.current = true
    setOffset(Math.min(0, Math.max(-REVEAL, baseOffset.current + dx)))
  }

  const handleTouchEnd = () => {
    if (!swiping.current) return
    const snap = offset < -REVEAL / 2 ? -REVEAL : 0
    baseOffset.current = snap
    setAnimating(true)
    setOffset(snap)
    swiping.current = false
  }

  const handleClickCapture = (e: React.MouseEvent) => {
    if (swipedThisTouch.current || offset !== 0) {
      e.preventDefault()
      e.stopPropagation()
      if (offset !== 0) {
        setAnimating(true)
        setOffset(0)
        baseOffset.current = 0
      }
      swipedThisTouch.current = false
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl">
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute inset-y-0 right-0 bg-red-500 text-white text-[13px] font-bold flex items-center justify-center"
        style={{ width: REVEAL }}
        aria-label="削除"
      >
        削除
      </button>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? 'transform 0.2s ease-out' : 'none',
          willChange: 'transform',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  )
}

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

// dbId は user_program_day_extras.id（削除に使用）、id は user_exercises.id（記録ページで使用）
type ExtraExercise = { dbId: string; id: string | null; name: string; target_muscle?: string; last_weight_kg?: number | null; last_reps?: number | null }
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

  const [currentWeek, setCurrentWeek] = useState(enrollment.current_week)
  const [extraExercises, setExtraExercises] = useState<ExtraExercise[]>([])
  const [weekStatus, setWeekStatus] = useState<{ completed_exercise_ids: string[]; all_complete: boolean } | null>(null)
  const [advancingWeek, setAdvancingWeek] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ name: string; onConfirm: () => void } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [masterExercises, setMasterExercises] = useState<MasterExercise[]>([])
  // exercise_master.id → user_exercises.id のマップ
  const [masterToUserExId, setMasterToUserExId] = useState<Map<string, string>>(new Map())
  const [masterLoading, setMasterLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Day 切替時に追加種目をAPIからロード
  useEffect(() => {
    setExtraExercises([])
    setShowAddForm(false)
    setSearchQuery('')
    fetch(`/api/program/day-extras?day=${selectedDay}`)
      .then(r => r.ok ? r.json() : { extras: [] })
      .then(data => setExtraExercises(data.extras ?? []))
      .catch(() => {})
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

  const refreshExtras = () => {
    fetch(`/api/program/day-extras?day=${selectedDay}`)
      .then(r => r.ok ? r.json() : { extras: [] })
      .then(data => setExtraExercises(data.extras ?? []))
      .catch(() => {})
  }

  const hideSlot = async (slotId: string) => {
    await fetch(`/api/program/slot-assignments/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollment.id, is_hidden: true }),
    }).catch(() => {})
    // スロットの割り当ては日をまたいで共有されるため、キャッシュ全体を破棄する
    suggestionCache.current.clear()
    fetchDay(selectedDay, { force: true })
  }

  const addExercise = async (ex: { id: string | null; masterId: string | null; name: string; target_muscle?: string }) => {
    let finalId = ex.id

    // user_exercises 未登録の場合は自動登録してIDを取得
    if (!finalId) {
      try {
        const body = ex.masterId
          ? { exercise_master_id: ex.masterId }
          : { custom_name: ex.name }
        const res = await fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          finalId = data.exercise?.id ?? null
          if (ex.masterId && finalId) {
            const masterId = ex.masterId
            setMasterToUserExId(prev => new Map(prev).set(masterId, finalId!))
          }
        }
      } catch { /* ignore — fall back to /record without exerciseId */ }
    }

    if (finalId) {
      await fetch('/api/program/day-extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: finalId, day_number: selectedDay }),
      }).catch(() => {})
      refreshExtras()
    }
    setShowAddForm(false)
    setSearchQuery('')
  }

  const removeExercise = async (dbId: string) => {
    const res = await fetch(`/api/program/day-extras/${dbId}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) {
      setExtraExercises(prev => prev.filter(e => e.dbId !== dbId))
    }
  }

  const trimmedQuery = searchQuery.trim()
  const filteredMaster = trimmedQuery
    ? masterExercises.filter(e => e.name.includes(trimmedQuery))
    : masterExercises

  // すでに追加済み or プログラムスロットにある種目IDセット
  const addedNames = new Set(extraExercises.map(e => e.name))
  const slotNames = new Set(suggestion?.slots.map(s => s.exercise.name) ?? [])

  const availableDays = Array.from({ length: enrollment.days_per_week }, (_, i) => i + 1)

  const fetchWeekStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/suggest/program/week-status')
      if (res.ok) {
        const data = await res.json()
        setWeekStatus(data)
      }
    } catch { /* ignore */ }
  }, [])

  const advanceWeek = async () => {
    setAdvancingWeek(true)
    try {
      const res = await fetch('/api/program/advance-week', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setCurrentWeek(data.current_week)
        await fetchWeekStatus()
        // 週が進むと全日程の週次パラメータが変わるため、キャッシュ全体を破棄する
        suggestionCache.current.clear()
        await fetchDay(selectedDay, { force: true })
      }
    } catch { /* ignore */ } finally {
      setAdvancingWeek(false)
    }
  }

  // 日ごとの提案キャッシュ。/api/suggest/program はスロット・週次パラメータ・直近実績
  // （select=*の重いtraining_setsクエリ含む）を日に関わらず毎回まるごと取得し直すため、
  // タブを行き来するだけで同じデータを何度も引き直してしまっていた。同じ日に戻ってきた
  // 時は再取得せずキャッシュを使う（2026-07-21、Supabase egress削減）。
  const suggestionCache = useRef<Map<number, ProgramSuggestion>>(new Map())

  const fetchDay = useCallback(async (day: number, opts?: { force?: boolean }) => {
    if (!opts?.force) {
      const cached = suggestionCache.current.get(day)
      if (cached) {
        setSuggestion(cached)
        setError(null)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/suggest/program?day=${day}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'エラーが発生しました')
      }
      const data = await res.json()
      suggestionCache.current.set(day, data.suggestion)
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

  useEffect(() => {
    fetchWeekStatus()
  }, [fetchWeekStatus])

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
              Week {currentWeek} / 9 · {PHASE_LABELS[suggestion?.phase ?? 'volume']}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {(() => {
                const DAY_LABELS_JP = ['日', '月', '火', '水', '木', '金', '土']
                const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS_JP[d.getDay()]})`
                const start = new Date(enrollment.started_at)
                start.setDate(start.getDate() + (currentWeek - 1) * 7)
                const end = new Date(start)
                end.setDate(end.getDate() + 6)
                return `${fmt(start)} 〜 ${fmt(end)}`
              })()}
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

      {/* 全種目完了 → 次の週へボタン（2026-07-08、下部に埋もれて気付きにくいとの
          フィードバックを受けてコンテンツ最上部に移動） */}
      {weekStatus?.all_complete && currentWeek < 9 && (
        <div className="px-5 pt-1">
          <button
            onClick={advanceWeek}
            disabled={advancingWeek}
            className="w-full py-4 rounded-3xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-50 transition-opacity"
          >
            {advancingWeek ? '更新中...' : `Week ${currentWeek} 完了 → Week ${currentWeek + 1} へ`}
          </button>
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
            {suggestion.slots
              .sort((a, b) => {
                const aDone = weekStatus?.completed_exercise_ids.includes(a.exercise.id) ?? false
                const bDone = weekStatus?.completed_exercise_ids.includes(b.exercise.id) ?? false
                return Number(aDone) - Number(bDone)
              })
              .map(slot => (
                <SwipeableCard
                  key={slot.slot_id}
                  onRemove={() => setDeleteConfirm({ name: slot.exercise.name, onConfirm: () => hideSlot(slot.slot_id) })}
                >
                  <ProgramSlotCard
                    slot={slot}
                    is_done={weekStatus?.completed_exercise_ids.includes(slot.exercise.id) ?? false}
                  />
                </SwipeableCard>
              ))}

            {/* 追加種目カード */}
            {extraExercises.map(ex => {
              const isDone = ex.id != null && (weekStatus?.completed_exercise_ids.includes(ex.id) ?? false)
              return (
                <SwipeableCard key={ex.dbId} onRemove={() => setDeleteConfirm({ name: ex.name, onConfirm: () => removeExercise(ex.dbId) })}>
                  <Link
                    href={ex.id ? `/record?exerciseId=${ex.id}` : '/record'}
                    className={`block rounded-3xl px-5 pt-4 pb-5 active:scale-[0.99] transition-transform ${
                      isDone
                        ? 'bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800/50'
                        : 'bg-white dark:bg-zinc-900 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-none border border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
                          {ex.target_muscle ? TARGET_MUSCLE_LABELS[ex.target_muscle as TargetMuscle] ?? '追加種目' : '追加種目'}
                        </p>
                        <h3 className={`text-[15px] font-bold leading-snug ${isDone ? 'text-zinc-400 dark:text-zinc-500' : 'text-black dark:text-white'}`}>
                          {ex.name}
                        </h3>
                      </div>
                      {isDone
                        ? <CheckCircle2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mt-1 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 mt-1 shrink-0" />
                      }
                    </div>
                    {ex.last_weight_kg != null && (
                      <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
                        前回 {ex.last_weight_kg}kg × {ex.last_reps}回
                      </p>
                    )}
                  </Link>
                </SwipeableCard>
              )
            })}

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

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">「{deleteConfirm.name}」を外しますか？</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              今日のメニューから外します。トレーニング記録は削除されません。
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white"
              >
                キャンセル
              </button>
              <button
                onClick={() => { deleteConfirm.onConfirm(); setDeleteConfirm(null) }}
                className="flex-1 py-3 rounded-xl bg-red-500 text-sm font-medium text-white"
              >
                外す
              </button>
            </div>
          </div>
        </div>
      )}

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
                        target_muscle: ex.target_muscle,
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
