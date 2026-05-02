'use client'

import { useState } from 'react'
import { CreditCard } from 'lucide-react'

type Props = {
  status: string
}

export default function PortalButton({ status }: Props) {
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

  const label = status === 'past_due'
    ? 'お支払い情報を更新する'
    : status === 'active'
      ? 'お支払い情報を管理する'
      : 'クレジットカードを登録する'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 disabled:opacity-50 transition-opacity"
    >
      <div className="flex items-center gap-3">
        <CreditCard className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-black dark:text-white">{label}</span>
      </div>
      {loading && (
        <span className="text-xs text-zinc-400">読み込み中...</span>
      )}
    </button>
  )
}
