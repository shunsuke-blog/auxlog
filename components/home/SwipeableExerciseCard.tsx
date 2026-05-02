'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Suggestion } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { ChevronRight, Trash2 } from 'lucide-react'
import { SWIPE } from '@/lib/constants/swipe'

const { REVEAL_WIDTH, SNAP_THRESHOLD, DELETE_THRESHOLD } = SWIPE

type Props = {
  suggestion: Suggestion
  onDelete: () => void
}

export default function SwipeableExerciseCard({ suggestion, onDelete }: Props) {
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [animate, setAnimate] = useState(false)
  const [removing, setRemoving] = useState(false)

  const restingX = useRef(0)
  const startX = useRef(0)
  const startY = useRef(0)
  const moved = useRef(false)
  const axis = useRef<'h' | 'v' | null>(null)

  const { exercise, proposed_weight_kg, proposed_sets, proposed_reps, proposed_set_targets, reason, days_since_last, volume_status } = suggestion

  const allSameReps = proposed_set_targets.every(t => t.reps === proposed_reps)
  const repsLabel = allSameReps
    ? `${proposed_reps}回`
    : proposed_set_targets.map(t => t.reps).join(' / ') + '回'
  const dayLabel = days_since_last >= 999 ? '初回' : `${days_since_last}日ぶり`

  const weightDisplay = exercise.is_bodyweight
    ? (proposed_weight_kg > 0 ? `+${proposed_weight_kg}` : '自重')
    : (proposed_weight_kg > 0 ? String(proposed_weight_kg) : '—')
  const showKg = !exercise.is_bodyweight && proposed_weight_kg > 0

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY.current

      if (axis.current === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (axis.current !== 'h') return

      e.preventDefault()
      if (Math.abs(dx) > 4) moved.current = true

      const next = Math.min(0, restingX.current + dx)
      setTranslateX(next)
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    moved.current = false
    axis.current = null
    setAnimate(false)
  }

  const handleTouchEnd = () => {
    if (axis.current !== 'h') return
    setAnimate(true)

    if (translateX < -DELETE_THRESHOLD) {
      setTranslateX(-window.innerWidth)
      setRemoving(true)
      setTimeout(onDelete, 250)
    } else if (translateX < -SNAP_THRESHOLD) {
      setTranslateX(-REVEAL_WIDTH)
      restingX.current = -REVEAL_WIDTH
    } else {
      setTranslateX(0)
      restingX.current = 0
    }
  }

  const handleClick = () => {
    if (moved.current) return
    if (restingX.current !== 0) {
      setAnimate(true)
      setTranslateX(0)
      restingX.current = 0
      return
    }
    router.push(`/record?exerciseId=${exercise.id}`)
  }

  const handleDelete = () => {
    setAnimate(true)
    setRemoving(true)
    setTimeout(onDelete, 250)
  }

  if (removing) return null

  return (
    <div className="relative overflow-hidden rounded-3xl">
      {/* 削除ボタン */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 rounded-r-3xl overflow-hidden"
        style={{ width: Math.abs(translateX) }}
      >
        <button
          onClick={handleDelete}
          className="flex flex-col items-center gap-1 text-white w-full h-full justify-center"
        >
          {Math.abs(translateX) > 36 && <Trash2 className="w-4 h-4" />}
          {Math.abs(translateX) > 52 && <span className="text-[10px] font-semibold">削除</span>}
        </button>
      </div>

      {/* カード本体 */}
      <div
        ref={cardRef}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: animate ? 'transform 0.25s ease' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="relative bg-white dark:bg-zinc-900 rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.07)] dark:shadow-none dark:border dark:border-zinc-800 cursor-pointer select-none active:scale-[0.99] transition-transform px-5 pt-4 pb-5"
      >
        {/* 種目名・部位・バッジ行 */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-black dark:text-white leading-snug">
                {exercise.name}
              </h3>
              {days_since_last >= 7 && (
                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full tracking-wide">
                  優先
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {TARGET_MUSCLE_LABELS[exercise.target_muscle]}
              </span>
              {volume_status === 'low' && (
                <span className="text-[9px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">
                  ボリューム不足
                </span>
              )}
              {volume_status === 'high' && (
                <span className="text-[9px] font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded-full">
                  過負荷注意
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
              {dayLabel}
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
          </div>
        </div>

        {/* 仕切り線 */}
        <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

        {/* 重量・セット */}
        <div>
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-[34px] font-black tracking-tight text-black dark:text-white">
              {weightDisplay}
            </span>
            {showKg && (
              <span className="text-base font-medium text-zinc-400 dark:text-zinc-500">kg</span>
            )}
            <span className="text-sm text-zinc-400 dark:text-zinc-500 ml-1">
              {proposed_sets}セット
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed">
            {reason}
          </p>
        </div>
      </div>
    </div>
  )
}
