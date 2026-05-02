'use client'

import { useState } from 'react'
import { CreditCard, AlertCircle } from 'lucide-react'

type Props = {
  status: string
}

export default function PortalButton({ status }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      // stripe_customer_id がない場合に備えてサブスクリプション作成を先に試みる
      await fetch('/api/stripe/create-subscription', { method: 'POST' })

      const res = await fetch('/api/stripe/create-portal-session', { method: 'POST' })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'ポータルへの接続に失敗しました')
        setLoading(false)
      }
    } catch {
      setError('エラーが発生しました。再度お試しください。')
      setLoading(false)
    }
  }

  const label = status === 'past_due'
    ? 'お支払い情報を更新する'
    : status === 'active'
      ? 'お支払い情報を管理する'
      : 'クレジットカードを登録する'

  return (
    <div className="space-y-1.5">
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
      {error && (
        <div className="flex items-center gap-2 px-2 text-xs text-red-500">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
