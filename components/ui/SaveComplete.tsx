'use client'

import { useEffect, useState } from 'react'

type Props = {
  onDone: () => void
}

export default function SaveComplete({ onDone }: Props) {
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
      <p className="text-6xl mb-5">💪</p>
      <p className="text-4xl font-black text-white tracking-tight">Great!</p>
      <p className="mt-3 text-sm text-zinc-400">記録を保存しました</p>
    </div>
  )
}
