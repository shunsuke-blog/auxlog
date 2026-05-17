'use client'

import { useEffect, useState } from 'react'

type SaveResult = 'record' | 'volume_up' | 'good_job'

type Props = {
  onDone: () => void
  result: SaveResult
}

const CONTENT: Record<SaveResult, { emoji: string; title: string; sub: string }> = {
  record:     { emoji: '🏆', title: 'Record!',     sub: '自己ベスト更新！' },
  volume_up:  { emoji: '📈', title: 'Volume Up!',  sub: '総負荷が上がった' },
  good_job:   { emoji: '💪', title: 'Good Job!',   sub: 'よく頑張りました' },
}

export default function SaveComplete({ onDone, result }: Props) {
  const [visible, setVisible] = useState(false)
  const { emoji, title, sub } = CONTENT[result]

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
      <p className="text-6xl mb-5">{emoji}</p>
      <p className="text-4xl font-black text-white tracking-tight">{title}</p>
      <p className="mt-3 text-sm text-zinc-400">{sub}</p>
    </div>
  )
}
