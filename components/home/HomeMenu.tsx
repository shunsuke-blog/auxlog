'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import type { Suggestion, UserExercise } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import SwipeableExerciseCard from './SwipeableExerciseCard'

type Props = {
  today: string
  initialSuggestions: Suggestion[]
  allExercises: UserExercise[]
}

export default function HomeMenu({ today, initialSuggestions, allExercises }: Props) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [showModal, setShowModal] = useState(false)

  const visibleIds = new Set(suggestions.map(s => s.exercise.id))
  const addableExercises = allExercises.filter(ex => !visibleIds.has(ex.id))

  const removeExercise = (exerciseId: string) => {
    setSuggestions(prev => prev.filter(s => s.exercise.id !== exerciseId))
  }

  const addExercise = (exercise: UserExercise) => {
    const suggestion: Suggestion = {
      exercise,
      proposed_weight_kg: 0,
      proposed_sets: exercise.default_sets,
      proposed_reps: exercise.default_reps,
      reason: '手動で追加',
      days_since_last: 0,
      weekly_volume_sets: 0,
      volume_status: 'low',
    }
    setSuggestions(prev => [...prev, suggestion])
    setShowModal(false)
  }

  return (
    <>
      {/* ヘッダー */}
      <div className="px-6 pt-14 pb-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{today}</p>
          <h1 className="text-2xl font-semibold text-black dark:text-white mt-0.5">
            今日のメニュー
          </h1>
        </div>
        {allExercises.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="w-9 h-9 rounded-full bg-black dark:bg-white flex items-center justify-center mb-0.5"
          >
            <Plus className="w-5 h-5 text-white dark:text-black" />
          </button>
        )}
      </div>

      {/* カードリスト */}
      <div className="px-6 pb-6 space-y-3">
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
          <div className="text-center py-16 text-sm text-zinc-400 dark:text-zinc-600">
            <p>すべての種目を削除しました</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-black dark:text-white font-medium underline underline-offset-2"
            >
              追加する
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
        <div className="fixed inset-0 z-50 flex items-end justify-center">
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
