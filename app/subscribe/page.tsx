'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CreditCard, LogOut } from 'lucide-react'

function SubscribeContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const [loading, setLoading] = useState(false)

  const heading = reason === 'canceled'
    ? 'トライアルが終了しました'
    : reason === 'past_due'
      ? '支払いに失敗しました'
      : 'ご利用を続けるには'

  const description = reason === 'canceled'
    ? '無料トライアルが終了しました。引き続きご利用いただくにはクレジットカードの登録が必要です。'
    : reason === 'past_due'
      ? '決済に失敗しました。お支払い情報を更新してください。'
      : 'サブスクリプションが有効ではありません。クレジットカードを登録してください。'

  const handleRegisterCard = async () => {
    setLoading(true)
    try {
      await fetch('/api/stripe/create-subscription', { method: 'POST' })
      const res = await fetch('/api/stripe/create-portal-session', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white flex items-center justify-center mx-auto">
            <CreditCard className="w-7 h-7 text-white dark:text-black" />
          </div>
          <h1 className="text-xl font-bold text-black dark:text-white">{heading}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>
        </div>

        <div className="space-y-3">
          <div className="text-center">
            <p className="text-2xl font-black text-black dark:text-white">¥480</p>
            <p className="text-xs text-zinc-400 mt-0.5">/ 月（税込）</p>
          </div>

          <button
            onClick={handleRegisterCard}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            {loading ? '読み込み中...' : 'クレジットカードを登録する'}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <Suspense>
      <SubscribeContent />
    </Suspense>
  )
}
