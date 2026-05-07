'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  sessionDates: Set<string>
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
  focusDate?: string | null  // 月カレンダーから日付が選ばれた時にその週へジャンプ
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMondayOfWeek(offset: number): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay()
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMonday + offset * 7)
  return monday
}

function getWeekOffsetForDate(dateStr: string): number {
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 今週の月曜
  const todayDow = today.getDay()
  const todayMonday = new Date(today)
  todayMonday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1))

  // 対象日の月曜
  const targetDow = target.getDay()
  const targetMonday = new Date(target)
  targetMonday.setDate(target.getDate() - (targetDow === 0 ? 6 : targetDow - 1))

  return Math.round((targetMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

export default function WeekCalendar({ sessionDates, selectedDate, onSelectDate, focusDate }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const startX = useRef(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const prevFocusDate = useRef<string | null | undefined>(undefined)

  // 月カレンダーで日付が選ばれたらその週にジャンプ
  useEffect(() => {
    if (focusDate && focusDate !== prevFocusDate.current) {
      prevFocusDate.current = focusDate
      setWeekOffset(getWeekOffsetForDate(focusDate))
    }
  }, [focusDate])

  const monday = getMondayOfWeek(weekOffset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const todayStr = toLocalDateString(new Date())

  // 表示する月ラベル（週が月をまたぐ場合は両方表示）
  const firstDay = days[0]
  const lastDay = days[6]
  const monthLabel =
    firstDay.getMonth() === lastDay.getMonth()
      ? `${firstDay.getFullYear()}年${firstDay.getMonth() + 1}月`
      : `${firstDay.getMonth() + 1}月〜${lastDay.getMonth() + 1}月`

  const changeWeek = (dir: 'prev' | 'next') => {
    setSlideDir(dir === 'prev' ? 'right' : 'left')
    setWeekOffset(w => w + (dir === 'next' ? 1 : -1))
  }

  // スライドアニメーションをリセット
  useEffect(() => {
    if (slideDir) {
      const t = setTimeout(() => setSlideDir(null), 200)
      return () => clearTimeout(t)
    }
  }, [slideDir])

  // スワイプ検出（passive: true で OK、カレンダー内は縦スクロールなし）
  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx > 50) changeWeek('prev')
    else if (dx < -50) changeWeek('next')
  }

  return (
    <div
      ref={wrapperRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 select-none"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => changeWeek('prev')}
          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {monthLabel}
        </span>
        <button
          onClick={() => changeWeek('next')}
          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 日付グリッド */}
      <div
        className="grid grid-cols-7 gap-1 transition-opacity duration-200"
        style={{ opacity: slideDir ? 0.4 : 1 }}
      >
        {/* 曜日ラベル */}
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-[11px] font-medium pb-1 ${
              i === 5 ? 'text-blue-400' : i === 6 ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {label}
          </div>
        ))}

        {/* 日付 */}
        {days.map((day, i) => {
          const dateStr = toLocalDateString(day)
          const hasSession = sessionDates.has(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const isSat = i === 5
          const isSun = i === 6

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              className="flex flex-col items-center gap-1 py-1 rounded-xl transition-colors"
            >
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : isToday
                    ? 'border-2 border-black dark:border-white text-black dark:text-white'
                    : isSat
                    ? 'text-blue-400'
                    : isSun
                    ? 'text-red-400'
                    : 'text-black dark:text-white'
                }`}
              >
                {day.getDate()}
              </span>
              {/* セッションインジケーター */}
              <span
                className={`w-1 h-1 rounded-full transition-colors ${
                  hasSession
                    ? 'bg-black dark:bg-white'
                    : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
