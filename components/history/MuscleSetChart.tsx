'use client'

import { useMemo } from 'react'
import type { UserExercise, HistorySession, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'

type Props = {
  sessions: HistorySession[]
  exercises: UserExercise[]
}

const DEFAULT_TARGETS: Record<TargetMuscle, number> = {
  chest: 10,
  back: 14,
  legs: 14,
  shoulders: 12,
  arms: 10,
  core: 8,
}

const MUSCLE_ORDER: TargetMuscle[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']

function CircleProgress({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = Math.min(value / target, 1)
  const r = 36
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct)
  const displayPct = Math.round((value / target) * 100)

  return (
    <div className="flex flex-col items-center gap-1.5 py-4 px-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
      <span className="text-[11px] font-semibold text-black dark:text-white">{label}</span>
      <div className="relative w-20 h-20">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-zinc-200 dark:text-zinc-700"
          />
          {value > 0 && (
            <circle
              cx="40" cy="40" r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 40 40)"
              className="text-black dark:text-white"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold leading-none text-black dark:text-white">{value}</span>
          <span className="text-[9px] text-zinc-400 leading-tight">/{target}</span>
        </div>
      </div>
      <span className={`text-xs font-bold ${displayPct >= 100 ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {displayPct}%
      </span>
    </div>
  )
}

export default function MuscleSetChart({ sessions, exercises }: Props) {
  const exerciseMap = useMemo(
    () => new Map(exercises.map(e => [e.id, e.target_muscle])),
    [exercises]
  )

  const weekData = useMemo(() => {
    const counts: Record<TargetMuscle, number> = {
      chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0,
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    for (const session of sessions) {
      if (new Date(session.trained_at) < sevenDaysAgo) continue
      for (const set of session.sets) {
        if (set.is_warmup) continue
        const muscle = exerciseMap.get(set.exercise_id)
        if (muscle) counts[muscle]++
      }
    }

    return counts
  }, [sessions, exerciseMap])

  return (
    <div className="px-6 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-black dark:text-white">週間ボリューム達成率</h2>
        <span className="text-xs text-zinc-400">直近7日間</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MUSCLE_ORDER.slice(0, 3).map(muscle => (
          <CircleProgress
            key={muscle}
            value={weekData[muscle]}
            target={DEFAULT_TARGETS[muscle]}
            label={TARGET_MUSCLE_LABELS[muscle]}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {MUSCLE_ORDER.slice(3).map(muscle => (
          <CircleProgress
            key={muscle}
            value={weekData[muscle]}
            target={DEFAULT_TARGETS[muscle]}
            label={TARGET_MUSCLE_LABELS[muscle]}
          />
        ))}
        <div />
      </div>

      <p className="text-[10px] text-zinc-400 mt-3 text-center">目標値はMEV（最低有効ボリューム）の目安です</p>
    </div>
  )
}
