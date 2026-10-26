'use client'

import { useEffect, useState } from 'react'
import { Check, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'

type SaveResult = 'record' | 'volume_up' | 'good_job'

type Props = {
  onDone: () => void
  result: SaveResult
}

// 自己ベスト更新（record）だけタイトルをゴールドにする（ふだんのティールと違う「特別な瞬間」、2026-10-25）
// 絵文字ではなく線のアイコンにする（hallmark の audit 2026-10-26）
const CONTENT: Record<SaveResult, { icon: LucideIcon; title: string; sub: string }> = {
  record:     { icon: Trophy,     title: 'Record!',     sub: 'New personal best' },
  volume_up:  { icon: TrendingUp, title: 'Volume Up!',  sub: 'Total volume went up' },
  good_job:   { icon: Check,      title: 'Good Job!',   sub: 'Nice work' },
}

export default function SaveComplete({ onDone, result }: Props) {
  const [visible, setVisible] = useState(false)
  const { icon: Icon, title, sub } = CONTENT[result]

  useEffect(() => {
    // マウント直後にフェードイン
    const show = requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, 1000)
    return () => {
      cancelAnimationFrame(show)
      clearTimeout(timer)
    }
  }, [onDone])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <Icon aria-hidden className={`w-14 h-14 mb-5 ${result === 'record' ? 'text-pr' : 'text-white'}`} strokeWidth={1.75} />
      <p className={`text-4xl font-black tracking-tight ${result === 'record' ? 'text-pr' : 'text-white'}`}>{title}</p>
      <p className="mt-3 text-sm text-zinc-400">{sub}</p>
    </div>
  )
}
