'use client'

import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { UserExercise, TrainingSet } from '@/types'

type Session = {
  id: string
  trained_at: string
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

export default function VolumeChart({ sessions, exercises }: Props) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id ?? ''
  )

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
        } else {
          const maxWeight = Math.max(...exSets.map(set => set.weight_kg))
          return { date, value: maxWeight }
        }
      })
      .filter(Boolean)
      .reverse()
  }, [sessions, selectedExerciseId, isBodyweight])

  if (exercises.length === 0) return null

  const yLabel = isBodyweight ? '回数' : '重量'
  const unit = isBodyweight ? '回' : 'kg'
  const title = isBodyweight ? '回数推移' : '重量推移'

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
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: '1px solid #f4f4f5', borderRadius: 8, backgroundColor: '#fff' }}
              formatter={(value) => [`${value}${unit}`, yLabel]}
            />
            <Line type="monotone" dataKey="value" stroke="#000" strokeWidth={2}
              dot={{ fill: '#000', r: 3 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
