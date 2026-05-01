'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, ChevronDown } from 'lucide-react'
import type { UserExercise, TrainingSet } from '@/types'

type Session = {
  id: string
  trained_at: string
  fatigue_level: number
  memo: string | null
  total_volume: number
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

export default function SessionList({ sessions, exercises }: Props) {
  // 展開中の種目キー: "sessionId-exerciseId"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const exerciseMap = new Map(exercises.map(e => [e.id, e]))

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-400 dark:text-zinc-600">
        まだ記録がありません
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map(session => {
        const exerciseIds = [...new Set(session.sets.map(s => s.exercise_id))]
        const date = new Date(session.trained_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          weekday: 'short',
        })

        return (
          <div
            key={session.id}
            className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 overflow-hidden"
          >
            {/* セッションヘッダー */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-black dark:text-white">{date}</span>
                <span className="text-xs text-zinc-400">疲労度 {session.fatigue_level}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">
                  {session.total_volume.toLocaleString()}kg
                </span>
                <Link
                  href={`/record/edit/${session.id}`}
                  className="p-1.5 text-zinc-300 dark:text-zinc-700 hover:text-black dark:hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* 種目一覧 */}
            <div className="divide-y divide-zinc-50 dark:divide-zinc-900">
              {exerciseIds.map(exId => {
                const exercise = exerciseMap.get(exId)
                const exSets = session.sets
                  .filter(s => s.exercise_id === exId)
                  .sort((a, b) => a.set_number - b.set_number)
                if (exSets.length === 0) return null

                const name = exercise?.name ?? '不明な種目'
                const maxWeight = Math.max(...exSets.map(s => s.weight_kg))
                const expandKey = `${session.id}-${exId}`
                const isExpanded = expanded.has(expandKey)
                const isBodyweight = exercise?.is_bodyweight ?? false

                return (
                  <div key={exId}>
                    {/* 種目行（タップで展開） */}
                    <button
                      onClick={() => toggleExpand(expandKey)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                          {name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-zinc-400">
                          {isBodyweight
                            ? (maxWeight > 0 ? `+${maxWeight}kg` : '自重')
                            : `${maxWeight}kg`
                          }{' '}× {exSets.length}セット
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* 展開時：セット詳細 */}
                    {isExpanded && (
                      <div className="px-5 pb-3 space-y-1.5 bg-zinc-50 dark:bg-zinc-900/50">
                        <div className="grid grid-cols-4 gap-2 pt-2 pb-1">
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">セット</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">重量</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">回数</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">余裕</span>
                        </div>
                        {exSets.map(set => (
                          <div key={set.id} className={`grid grid-cols-4 gap-2 ${set.is_warmup ? 'opacity-50' : ''}`}>
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              {set.set_number}
                              {set.is_warmup && (
                                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1 rounded">W</span>
                              )}
                            </span>
                            <span className="text-xs text-black dark:text-white text-right font-medium">
                              {isBodyweight
                                ? (set.weight_kg > 0 ? `+${set.weight_kg}kg` : '自重')
                                : `${set.weight_kg}kg`
                              }
                            </span>
                            <span className="text-xs text-black dark:text-white text-right font-medium">
                              {set.reps}回
                            </span>
                            <span className={`text-xs text-right font-medium ${set.rir ? 'text-emerald-500' : 'text-red-500'}`}>
                              {set.rir ? '余裕' : '限界'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {session.memo && (
              <p className="px-5 py-3 text-xs text-zinc-400 dark:text-zinc-600 border-t border-zinc-100 dark:border-zinc-900">
                {session.memo}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
