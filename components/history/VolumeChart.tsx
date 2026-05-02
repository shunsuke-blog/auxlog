'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { UserExercise, TrainingSet } from '@/types'

type Metric = 'max' | 'volume' | '1rm'

type Session = {
  id: string
  trained_at: string
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

const METRICS: { key: Metric; label: string }[] = [
  { key: 'max', label: '最大重量' },
  { key: 'volume', label: '総挙上量' },
  { key: '1rm', label: '推定1RM' },
]

function epley1RM(weight: number, reps: number) {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

export default function VolumeChart({ sessions, exercises }: Props) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id ?? ''
  )
  const [metric, setMetric] = useState<Metric>('max')

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const selectedExercise = exercises.find(e => e.id === selectedExerciseId)
  const isBodyweight = selectedExercise?.is_bodyweight ?? false

  const chartData = useMemo(() => {
    return sessions
      .filter(s => s.sets.some(set => set.exercise_id === selectedExerciseId))
      .map(s => {
        const exSets = s.sets.filter(set => set.exercise_id === selectedExerciseId && !set.is_warmup)
        if (exSets.length === 0) return null
        const date = new Date(s.trained_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })

        if (isBodyweight) {
          const totalReps = exSets.reduce((sum, set) => sum + set.reps, 0)
          return { date, value: totalReps }
        }

        let value: number
        if (metric === 'max') {
          value = Math.max(...exSets.map(set => set.weight_kg))
        } else if (metric === 'volume') {
          value = exSets.reduce((sum, set) => sum + set.weight_kg * set.reps, 0)
        } else {
          value = Math.max(...exSets.map(set => epley1RM(set.weight_kg, set.reps)))
        }
        return { date, value }
      })
      .filter(Boolean)
      .reverse()
  }, [sessions, selectedExerciseId, isBodyweight, metric])

  if (exercises.length === 0) return null

  const yLabel = isBodyweight ? '回数' : metric === 'volume' ? '総挙上量' : metric === '1rm' ? '推定1RM' : '最大重量'
  const unit = isBodyweight ? '回' : 'kg'
  const title = isBodyweight ? '回数推移' : yLabel

  return (
    <div className="px-6 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-black dark:text-white">{title}</h2>
        <select
          value={selectedExerciseId}
          onChange={e => setSelectedExerciseId(e.target.value)}
          className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 rounded-lg px-2.5 py-1.5 outline-none border-none"
        >
          {exercises.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {chartData.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-zinc-400">
          まだ記録がありません
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#f4f4f5'} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={metric === 'volume' ? 40 : 30}
              tickFormatter={v => metric === 'volume' && v >= 1000 ? `${(v / 1000).toFixed(1)}t` : String(v)}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                border: `1px solid ${isDark ? '#27272a' : '#f4f4f5'}`,
                borderRadius: 8,
                backgroundColor: isDark ? '#09090b' : '#fff',
                color: isDark ? '#fff' : '#000',
              }}
              formatter={(value) => [`${value}${unit}`, yLabel]}
            />
            <Line type="monotone" dataKey="value" stroke={isDark ? '#fff' : '#000'} strokeWidth={2}
              dot={{ fill: isDark ? '#fff' : '#000', r: 3 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {!isBodyweight && (
        <div className="flex justify-end gap-1 mt-3">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                metric === m.key
                  ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
