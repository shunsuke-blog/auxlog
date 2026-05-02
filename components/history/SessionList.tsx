'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, ChevronDown, PenLine } from 'lucide-react'
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

        // 自重種目のウォームアップ除外合計回数
        const totalBodyweightReps = exerciseIds.reduce((total, exId) => {
          if (!(exerciseMap.get(exId)?.is_bodyweight)) return total
          return total + session.sets
            .filter(s => s.exercise_id === exId && !s.is_warmup)
            .reduce((sum, s) => sum + s.reps, 0)
        }, 0)

        return (
          <div
            key={session.id}
            className="bg-white dark:bg-zinc-900 rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.07)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden"
          >
            {/* セッションヘッダー */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-black dark:text-white">{date}</span>
                <span className="text-xs text-zinc-400">疲労度 {session.fatigue_level}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* 有酸素ボリューム */}
                {session.total_volume > 0 && (
                  <span className="text-xs text-zinc-400">
                    {session.total_volume.toLocaleString()}kg
                  </span>
                )}
                {/* 自重種目の合計回数 */}
                {totalBodyweightReps > 0 && (
                  <span className="text-xs text-zinc-400">
                    {session.total_volume > 0 ? '+' : ''}{totalBodyweightReps}回
                  </span>
                )}
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
                const isBodyweight = exercise?.is_bodyweight ?? false
                const maxWeight = Math.max(...exSets.map(s => s.weight_kg))
                // 自重種目はウォームアップ除いた合計回数を表示
                const workingSets = exSets.filter(s => !s.is_warmup)
                const totalReps = workingSets.reduce((sum, s) => sum + s.reps, 0)
                const totalWorkingSets = workingSets.length
                const expandKey = `${session.id}-${exId}`
                const isExpanded = expanded.has(expandKey)

                return (
                  <div key={exId}>
                    <div className="flex items-center w-full">
                      <button
                        onClick={() => toggleExpand(expandKey)}
                        className="flex-1 flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left min-w-0"
                      >
                        {/* 折り畳み時は種目名のみ表示（省略なし） */}
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                          {name}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 transition-transform shrink-0 ml-2 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {/* 種目ごとの編集ボタン（実際のsession_idをセットから取得） */}
                      <Link
                        href={`/record/edit/${exSets[0]?.session_id ?? session.id}?exerciseId=${exId}`}
                        className="px-3 py-3 text-zinc-300 dark:text-zinc-700 hover:text-black dark:hover:text-white transition-colors shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        <PenLine className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-3 space-y-1.5 bg-zinc-50 dark:bg-zinc-900/50">
                        {/* 詳細ヘッダー: 最高重量 or 合計回数を目立たせる */}
                        <div className="flex items-baseline gap-3 pt-3 pb-1">
                          {isBodyweight ? (
                            <>
                              <span className="text-2xl font-bold text-black dark:text-white">
                                {totalReps}<span className="text-sm font-normal text-zinc-400 ml-0.5">回</span>
                              </span>
                              <span className="text-xs text-zinc-400">{totalWorkingSets}セット</span>
                            </>
                          ) : (
                            <>
                              <span className="text-2xl font-bold text-black dark:text-white">
                                {maxWeight}<span className="text-sm font-normal text-zinc-400 ml-0.5">kg</span>
                              </span>
                              <span className="text-xs text-zinc-400">{exSets.length}セット</span>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 pb-1">
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">セット</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">重量</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">回数</span>
                          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">余裕</span>
                        </div>
                        {exSets.map(set => {
                          const isMaxWeight = !isBodyweight && !set.is_warmup && set.weight_kg === maxWeight
                          return (
                          <div key={set.id} className={`grid grid-cols-4 gap-2 ${set.is_warmup ? 'opacity-50' : ''}`}>
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              {set.set_number}
                              {set.is_warmup && (
                                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1 rounded">W</span>
                              )}
                            </span>
                            <span className={`text-xs text-right ${isMaxWeight ? 'font-bold text-black dark:text-white' : 'font-medium text-zinc-400 dark:text-zinc-500'}`}>
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
                        )})}

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
