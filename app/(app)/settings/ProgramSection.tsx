'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

type Props = {
  enrollmentId: string | null
}

export default function ProgramSection({ enrollmentId }: Props) {
  const router = useRouter()
  const [resetting, setResetting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleReset = async () => {
    if (!confirm) {
      setConfirm(true)
      setResetError(null)
      return
    }
    setResetting(true)
    try {
      const res = await fetch('/api/program/reset', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/onboarding')
    } catch {
      setResetting(false)
      setConfirm(false)
      setResetError('リセットに失敗しました。もう一度お試しください。')
    }
  }

  if (!enrollmentId) return null

  return (
    <div className="space-y-3">
      <button
        onClick={handleReset}
        disabled={resetting}
        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-colors ${
          confirm
            ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950'
            : 'border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950'
        }`}
      >
        <div className="flex items-center gap-3">
          <RefreshCw className={`w-4 h-4 ${confirm ? 'text-red-500' : 'text-zinc-400'}`} />
          <span className={`text-sm ${confirm ? 'text-red-500 font-semibold' : 'text-black dark:text-white'}`}>
            {resetting ? 'リセット中...' : confirm ? '本当にリセットしますか？（もう一度タップ）' : 'プログラムをリセットして再開する'}
          </span>
        </div>
      </button>
      {resetError && (
        <p className="text-xs text-red-500 text-center px-1">{resetError}</p>
      )}
    </div>
  )
}
