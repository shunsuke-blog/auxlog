'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelButton() {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle')

  const handleCancel = async () => {
    setStep('loading')
    const res = await fetch('/api/stripe/cancel-subscription', { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error ?? '解約に失敗しました')
      setStep('idle')
    }
  }

  if (step === 'confirm') {
    return (
      <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-red-100 dark:border-red-900/40 space-y-3">
        <p className="text-sm text-black dark:text-white font-medium">本当に解約しますか？</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          解約後も現在の期限までサービスをご利用いただけます。期限後は自動的に終了します。
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setStep('idle')}
            className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400"
          >
            キャンセル
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium"
          >
            解約する
          </button>
        </div>
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div className="px-5 py-4 text-center text-sm text-zinc-400">解約処理中...</div>
    )
  }

  return (
    <button
      onClick={() => setStep('confirm')}
      className="w-full px-5 py-4 text-sm text-red-500 text-center"
    >
      サブスクリプションを解約する
    </button>
  )
}
