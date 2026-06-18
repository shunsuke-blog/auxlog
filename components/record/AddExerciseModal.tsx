'use client'

import { X } from 'lucide-react'
import type { UserExercise } from '@/types'

type Props = {
  exercises: UserExercise[]
  onAdd: (exercise: UserExercise) => void
  onClose: () => void
}

export default function AddExerciseModal({ exercises, onAdd, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
          <h2 className="text-base font-semibold text-black dark:text-white">種目を追加</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {exercises.length === 0 ? (
            <p className="text-center py-10 text-sm text-zinc-400">追加できる種目がありません</p>
          ) : (
            <div className="space-y-2">
              {exercises.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => onAdd(ex)}
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
}
