'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts'

type ExerciseHistory = {
  slotId: string
  exerciseName: string
  data: { week: number; maxWeight: number }[]
}

type Props = {
  exercises: ExerciseHistory[]
  currentWeek: number
}

export default function WeightProgressChart({ exercises, currentWeek }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (exercises.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center">
          トレーニングを記録するとここに重量の推移が表示されます
        </p>
      </div>
    )
  }

  const safeIdx = Math.min(selectedIdx, exercises.length - 1)
  const current = exercises[safeIdx]

  const chartData = Array.from({ length: currentWeek }, (_, i) => {
    const week = i + 1
    const entry = current.data.find(d => d.week === week)
    return { week, maxWeight: entry?.maxWeight ?? null }
  })

  // フェーズ帯の定義（currentWeekの範囲でクリップ）
  const PHASE_BANDS = [
    { x1: 1, x2: 4, fill: '#dbeafe', label: 'Vol' },   // blue-100
    { x1: 5, x2: 7, fill: '#fef3c7', label: 'Int' },   // amber-100
    { x1: 8, x2: 8, fill: '#d1fae5', label: 'Dld' },   // emerald-100
    { x1: 9, x2: 9, fill: '#fee2e2', label: 'Max' },   // red-100
  ]
  const visibleBands = PHASE_BANDS
    .filter(b => b.x1 <= currentWeek)
    .map(b => ({ ...b, x2: Math.min(b.x2, currentWeek) }))

  return (
    <div>
      {exercises.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {exercises.map((ex, i) => (
            <button
              key={ex.slotId}
              onClick={() => setSelectedIdx(i)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                i === safeIdx
                  ? 'bg-black dark:bg-white text-white dark:text-black font-medium'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {ex.exerciseName}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          {visibleBands.map(b => (
            <ReferenceArea
              key={b.x1}
              x1={b.x1}
              x2={b.x2}
              fill={b.fill}
              fillOpacity={0.4}
              stroke="none"
            />
          ))}
          <XAxis
            dataKey="week"
            tickFormatter={(v) => `W${v}`}
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}kg`}
          />
          <Tooltip
            formatter={(value) => value != null ? [`${value}kg`, '最高重量'] : ['−', '']}
            labelFormatter={(label) => `Week ${label}`}
            contentStyle={{
              backgroundColor: '#18181b',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#fff',
            }}
          />
          <Line
            dataKey="maxWeight"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5, fill: '#3b82f6' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
