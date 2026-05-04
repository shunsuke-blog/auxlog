'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import type { Suggestion, UserExercise } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import SwipeableExerciseCard from './SwipeableExerciseCard'
import { todayLocalDate } from '@/lib/utils/date'

const HIDDEN_KEY = 'auxlog_hidden_today'

type HiddenData = { date: string; ids: string[] }

function getHiddenIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = sessionStorage.getItem(HIDDEN_KEY)
    if (!stored) return []
    const data: HiddenData = JSON.parse(stored)
    const today = todayLocalDate()
    if (data.date !== today) { sessionStorage.removeItem(HIDDEN_KEY); return [] }
    return data.ids
  } catch { return [] }
}

function saveHiddenId(exerciseId: string) {
  try {
    const today = todayLocalDate()
    const ids = getHiddenIds()
    if (!ids.includes(exerciseId)) {
      sessionStorage.setItem(HIDDEN_KEY, JSON.stringify({ date: today, ids: [...ids, exerciseId] }))
    }
  } catch { /* ignore */ }
}

function removeHiddenId(exerciseId: string) {
  try {
    const today = todayLocalDate()
    const ids = getHiddenIds().filter(id => id !== exerciseId)
    sessionStorage.setItem(HIDDEN_KEY, JSON.stringify({ date: today, ids }))
  } catch { /* ignore */ }
}

type Props = {
  initialSuggestions: Suggestion[]
  allExercises: UserExercise[]
}

export default function HomeMenu({ initialSuggestions, allExercises }: Props) {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
  // 初期化時に sessionStorage の非表示リストを適用
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => {
    const hiddenIds = getHiddenIds()
    return hiddenIds.length > 0
      ? initialSuggestions.filter(s => !hiddenIds.includes(s.exercise.id))
      : initialSuggestions
  })
  const [showModal, setShowModal] = useState(false)

  const visibleIds = new Set(suggestions.map(s => s.exercise.id))
  const addableExercises = allExercises.filter(ex => !visibleIds.has(ex.id))

  const removeExercise = (exerciseId: string) => {
    setSuggestions(prev => prev.filter(s => s.exercise.id !== exerciseId))
    saveHiddenId(exerciseId)   // sessionStorage に保存
  }

  const addExercise = (exercise: UserExercise) => {
    removeHiddenId(exercise.id)

    // 元の提案データがあれば復元、なければデフォルト値で生成
    const original = initialSuggestions.find(s => s.exercise.id === exercise.id)
    if (original) {
      setSuggestions(prev => [...prev, original])
    } else {
      const defaultReps = exercise.default_reps
      const defaultSets = exercise.default_sets
      const suggestion: Suggestion = {
        exercise,
        proposed_weight_kg: 0,
        proposed_sets: defaultSets,
        proposed_reps: defaultReps,
        proposed_set_targets: Array.from({ length: defaultSets }, (_, i) => ({
          set_number: i + 1,
          weight_kg: 0,
          reps: Math.max(1, defaultReps - i),
          is_warmup: false,
        })),
        reason: '手動で追加',
        days_since_last: 0,
        weekly_volume_sets: 0,
        volume_status: 'low',
      }
      setSuggestions(prev => [...prev, suggestion])
    }
    setShowModal(false)
  }

  return (
    <>
      {/* ヘッダー（固定） */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide">{today}</p>
          <h1 className="text-xl font-black text-black dark:text-white tracking-tight leading-tight">
            今日のメニュー
          </h1>
        </div>
        {allExercises.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="w-9 h-9 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-md"
          >
            <Plus className="w-5 h-5 text-white dark:text-black" />
          </button>
        )}
      </div>

      {/* カードリスト */}
      <div className="px-5 py-6 space-y-4">
        {allExercises.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-400 dark:text-zinc-600 mb-4">
              まずは種目を登録してください
            </p>
            <Link
              href="/exercises"
              className="inline-block px-5 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium"
            >
              種目を登録する
            </Link>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-4xl">💪</p>
            <p className="text-lg font-semibold text-black dark:text-white">今日のメニュー完了！</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">お疲れさまでした。よく頑張りました。</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 text-xs text-zinc-400 dark:text-zinc-600 underline underline-offset-2"
            >
              種目を追加する
            </button>
          </div>
        ) : (
          suggestions.map(suggestion => (
            <SwipeableExerciseCard
              key={suggestion.exercise.id}
              suggestion={suggestion}
              onDelete={() => removeExercise(suggestion.exercise.id)}
            />
          ))
        )}
      </div>

      {/* 追加モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
              <h2 className="text-base font-semibold text-black dark:text-white">種目を追加</h2>
              <button onClick={() => setShowModal(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {addableExercises.length === 0 ? (
                <div className="text-center py-10 text-sm text-zinc-400">
                  すべての種目が表示されています
                </div>
              ) : (
                <div className="space-y-2">
                  {addableExercises.map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => addExercise(ex)}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <span className="text-sm font-medium text-black dark:text-white">
                        {ex.name}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full">
                        {TARGET_MUSCLE_LABELS[ex.target_muscle]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
