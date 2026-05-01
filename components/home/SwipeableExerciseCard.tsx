'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Suggestion } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { AlertTriangle, TrendingDown, ChevronRight, Trash2 } from 'lucide-react'

const REVEAL_WIDTH = 72    // 削除ボタンの幅
const SNAP_THRESHOLD = 36  // この距離以上でスナップして表示
const DELETE_THRESHOLD = 140 // この距離以上でそのまま削除

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

  const restingX = useRef(0)    // ジェスチャー前のX位置
  const startX = useRef(0)
  const startY = useRef(0)
  const moved = useRef(false)   // タップとスワイプの判別用
  const axis = useRef<'h' | 'v' | null>(null) // 決定した軸

  const { exercise, proposed_weight_kg, proposed_sets, proposed_reps, reason, days_since_last, volume_status } = suggestion
  const dayLabel = days_since_last >= 999 ? '初回' : `${days_since_last}日ぶり`

  // passive: false が必要なので useEffect でネイティブ登録
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

      e.preventDefault() // 水平スワイプ中はスクロールをブロック
      if (Math.abs(dx) > 4) moved.current = true

      const next = Math.min(0, restingX.current + dx) // 左方向は無制限
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
      // そのまま左に飛ばして削除
      setTranslateX(-window.innerWidth)
      setRemoving(true)
      setTimeout(onDelete, 250)
    } else if (translateX < -SNAP_THRESHOLD) {
      // 削除ボタンを表示した状態でスナップ
      setTranslateX(-REVEAL_WIDTH)
      restingX.current = -REVEAL_WIDTH
    } else {
      setTranslateX(0)
      restingX.current = 0
    }
  }

  const handleClick = () => {
    if (moved.current) return // スワイプだったのでタップ無視

    if (restingX.current !== 0) {
      // 開いていたら閉じる
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
    <div className="relative overflow-hidden rounded-2xl">
      {/* 削除ボタン（スワイプで現れる） */}
      <div className="absolute inset-y-0 right-0 w-[72px] flex flex-col items-center justify-center bg-red-500 rounded-r-2xl">
        <button onClick={handleDelete} className="flex flex-col items-center gap-1 text-white w-full h-full justify-center">
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-semibold">削除</span>
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
        className="relative bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 px-6 py-5 cursor-pointer select-none active:bg-zinc-50 dark:active:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-black dark:text-white">
              {exercise.name}
            </h3>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {TARGET_MUSCLE_LABELS[exercise.target_muscle]}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-full">
              {dayLabel}
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
          </div>
        </div>

        <div className="text-2xl font-semibold tracking-tight text-black dark:text-white mb-1.5">
          {proposed_weight_kg > 0 ? `${proposed_weight_kg}kg` : '—'}{' '}
          <span className="text-base font-normal text-zinc-500">
            × {proposed_reps}回 × {proposed_sets}セット
          </span>
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">{reason}</p>

        {volume_status === 'low' && (
          <div className="flex items-center gap-1.5 text-amber-500 text-xs">
            <TrendingDown className="w-3.5 h-3.5" />
            ボリューム不足（週10セット未満）
          </div>
        )}
        {volume_status === 'high' && (
          <div className="flex items-center gap-1.5 text-red-500 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            オーバートレーニング注意（週20セット超）
          </div>
        )}
      </div>
    </div>
  )
}
