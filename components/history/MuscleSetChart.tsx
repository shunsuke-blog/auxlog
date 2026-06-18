'use client'

import { useMemo, useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { UserExercise, TrainingSet, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'

type Session = {
  trained_at: string
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

const MUSCLE_COLORS_LIGHT: Record<TargetMuscle, string> = {
  chest:     '#18181b',
  back:      '#52525b',
  legs:      '#a1a1aa',
  shoulders: '#d4d4d8',
  arms:      '#e4e4e7',
}

const MUSCLE_COLORS_DARK: Record<TargetMuscle, string> = {
  chest:     '#ffffff',
  back:      '#a1a1aa',
  legs:      '#71717a',
  shoulders: '#3f3f46',
  arms:      '#27272a',
}

export default function MuscleSetChart({ sessions, exercises }: Props) {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const exerciseMap = useMemo(
    () => new Map(exercises.map(e => [e.id, e.target_muscle])),
    [exercises]
  )

  const data = useMemo(() => {
    const counts: Record<TargetMuscle, number> = {
      chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0,
    }

    const fourWeeksAgo = new Date()
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

    for (const session of sessions) {
      if (new Date(session.trained_at) < fourWeeksAgo) continue
      for (const set of session.sets) {
        if (set.is_warmup) continue
        const muscle = exerciseMap.get(set.exercise_id)
        if (muscle) counts[muscle]++
      }
    }

    const total = Object.values(counts).reduce((s, n) => s + n, 0)
    if (total === 0) return []

    return (Object.entries(counts) as [TargetMuscle, number][])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, count]) => ({
        muscle,
        name: TARGET_MUSCLE_LABELS[muscle],
        value: count,
        pct: Math.round((count / total) * 100),
      }))
  }, [sessions, exerciseMap])

  if (data.length === 0) return null

  const colors = isDark ? MUSCLE_COLORS_DARK : MUSCLE_COLORS_LIGHT

  return (
    <div className="px-6 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
      <h2 className="text-sm font-semibold text-black dark:text-white mb-4">
        筋肉グループ別セット数
        <span className="text-xs font-normal text-zinc-400 ml-2">過去4週間</span>
      </h2>

      <div className="flex items-center gap-6">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={72}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map(entry => (
                <Cell key={entry.muscle} fill={colors[entry.muscle]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                border: `1px solid ${isDark ? '#27272a' : '#f4f4f5'}`,
                borderRadius: 8,
                backgroundColor: isDark ? '#09090b' : '#fff',
                color: isDark ? '#fff' : '#000',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, _: any, props: any) =>
                [`${value}セット`, props?.payload?.name ?? '']
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-2 flex-1">
          {data.map(entry => (
            <div key={entry.muscle} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors[entry.muscle] }}
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">{entry.name}</span>
              <span className="text-xs font-medium text-black dark:text-white">{entry.value}セット</span>
              <span className="text-xs text-zinc-400 w-8 text-right">{entry.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
