'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { CalendarDays } from 'lucide-react'
import WeekCalendar from './WeekCalendar'
import MonthCalendar from './MonthCalendar'
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
  const [showMonthCalendar, setShowMonthCalendar] = useState(false)
  const [focusDate, setFocusDate] = useState<string | null>(null)

  const sessionDates = new Set(sessions.map(s => s.trained_at))

  const filteredSessions = selectedDate
    ? sessions.filter(s => s.trained_at === selectedDate)
    : sessions

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-white">履歴</h1>
        <button
          onClick={() => setShowMonthCalendar(true)}
          className="p-2 rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
        >
          <CalendarDays className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-6 space-y-4">
        {/* 週カレンダー（常時表示） */}
        <WeekCalendar
          sessionDates={sessionDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          focusDate={focusDate}
        />

        {exercises.length > 0 && (
          <VolumeChart sessions={sessions} exercises={exercises} />
        )}

        {selectedDate ? (
          filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-600">
              この日の記録はありません
            </div>
          ) : (
            <SessionList sessions={filteredSessions} exercises={exercises} />
          )
        ) : null}
      </div>

      {/* 月カレンダーモーダル */}
      {showMonthCalendar && (
        <MonthCalendar
          sessionDates={sessionDates}
          selectedDate={selectedDate}
          onSelectDate={date => {
            setSelectedDate(date)
            setFocusDate(date)
            setShowMonthCalendar(false)
          }}
          onClose={() => setShowMonthCalendar(false)}
        />
      )}
    </div>
  )
}
