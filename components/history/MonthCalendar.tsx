'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = {
  sessionDates: Set<string>
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onClose: () => void
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

export default function MonthCalendar({ sessionDates, selectedDate, onSelectDate, onClose }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // 月の最初の日・最後の日
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // グリッドの開始（月曜始まり: 0=月,...,6=日）
  const startDow = (firstDay.getDay() + 6) % 7  // 0=月
  const totalCells = startDow + lastDay.getDate()
  const rows = Math.ceil(totalCells / 7)

  const cells: (Date | null)[] = []
  for (let i = 0; i < rows * 7; i++) {
    const dayNum = i - startDow + 1
    cells.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? new Date(year, month, dayNum) : null)
  }

  const todayStr = toLocalDateString(today)

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl pb-8">
        {/* ヘッダー */}
        <div className="flex items-center px-4 py-4 border-b border-zinc-100 dark:border-zinc-900">
          <button onClick={prevMonth} className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="flex-1 text-center text-sm font-semibold text-black dark:text-white">
            {year}年{month + 1}月
          </span>
          <button onClick={nextMonth} className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-2" />
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 曜日ラベル */}
        <div className="grid grid-cols-7 px-4 pt-3 pb-1">
          {DAY_LABELS.map((label, i) => (
            <div key={label} className={`text-center text-[11px] font-medium ${
              i === 5 ? 'text-blue-400' : i === 6 ? 'text-red-400' : 'text-zinc-400'
            }`}>
              {label}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-y-1 px-4 pb-2">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const dateStr = toLocalDateString(day)
            const hasSession = sessionDates.has(dateStr)
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const col = i % 7
            const isSat = col === 5
            const isSun = col === 6

            return (
              <button
                key={dateStr}
                onClick={() => { onSelectDate(dateStr); onClose() }}
                className="flex flex-col items-center gap-0.5 py-1"
              >
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${
                  isSelected
                    ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
                    : isToday
                    ? 'border-2 border-black dark:border-white text-black dark:text-white font-semibold'
                    : isSat
                    ? 'text-blue-400'
                    : isSun
                    ? 'text-red-400'
                    : 'text-black dark:text-white'
                }`}>
                  {day.getDate()}
                </span>
                <span className={`w-1 h-1 rounded-full ${
                  hasSession
                    ? isSelected ? 'bg-white dark:bg-black' : 'bg-black dark:bg-white'
                    : 'bg-transparent'
                }`} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
