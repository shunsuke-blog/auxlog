'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import WeekCalendar from './WeekCalendar'
import SessionList from './SessionList'
import type { UserExercise, TrainingSet } from '@/types'

const VolumeChart = dynamic(() => import('./VolumeChart'), { ssr: false })

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

export default function HistoryClient({ sessions, exercises }: Props) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr)

  const sessionDates = new Set(sessions.map(s => s.trained_at))

  const filteredSessions = selectedDate
    ? sessions.filter(s => s.trained_at === selectedDate)
    : sessions

  const handleSelectDate = (date: string | null) => {
    setSelectedDate(date)
  }

  return (
    <div className="space-y-4">
      <WeekCalendar
        sessionDates={sessionDates}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />

      {exercises.length > 0 && (
        <VolumeChart sessions={sessions} exercises={exercises} />
      )}

      {selectedDate && (
        filteredSessions.length === 0 ? (
          <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-600">
            この日の記録はありません
          </div>
        ) : (
          <SessionList sessions={filteredSessions} exercises={exercises} />
        )
      )}
    </div>
  )
}
