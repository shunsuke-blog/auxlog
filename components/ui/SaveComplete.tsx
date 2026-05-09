'use client'

import { useEffect, useState } from 'react'

type Props = {
  onDone: () => void
  isImproved: boolean
}

export default function SaveComplete({ onDone, isImproved }: Props) {
  const [visible, setVisible] = useState(false)

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
      <p className="text-6xl mb-5">{isImproved ? '🏆' : '💪'}</p>
      <p className="text-4xl font-black text-white tracking-tight">{isImproved ? 'Record!' : 'Good Job!'}</p>
      <p className="mt-3 text-sm text-zinc-400">{isImproved ? '自己ベスト更新！' : 'よく頑張りました'}</p>
    </div>
  )
}
