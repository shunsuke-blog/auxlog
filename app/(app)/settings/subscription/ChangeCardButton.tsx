'use client'

import { useState } from 'react'

export default function ChangeCardButton() {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    const res = await fetch('/api/stripe/create-portal-session', { method: 'POST' })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors disabled:opacity-40"
    >
      {loading ? '読み込み中...' : 'カード情報を変更する →'}
    </button>
  )
}
