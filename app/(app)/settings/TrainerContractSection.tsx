'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, UserRound } from 'lucide-react'

type Props = {
  link: { linkId: string; trainerName: string; status: 'active' | 'paused' } | null
}

// トレーニー側の契約。契約中なら担当トレーナーと「契約を終了」、契約していなければ招待コードの入力。
export default function TrainerContractSection({ link }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!link) {
    return (
      <Link
        href="/invite"
        className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900"
      >
        <div className="flex items-center gap-3">
          <UserRound className="w-4 h-4 text-zinc-400" />
          <span className="text-sm text-black dark:text-white">トレーナーの招待コードを入力</span>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
      </Link>
    )
  }

  const endContract = async () => {
    setEnding(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${link.linkId}/end`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '契約の終了に失敗しました')
      try { sessionStorage.removeItem('auxlog_suggest_v1') } catch { /* ignore */ }
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '契約の終了に失敗しました')
      setEnding(false)
    }
  }

  return (
    <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">担当トレーナー</h2>
      <p className="text-sm text-black dark:text-white">
        {link.trainerName} さん{link.status === 'paused' ? '（一時停止中）' : ''}
      </p>

      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="text-xs font-semibold text-red-500">
          契約を終了する
        </button>
      ) : (
        <div className="space-y-3 rounded-xl bg-red-50 dark:bg-red-950/40 px-4 py-3">
          <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1 leading-relaxed">
            <p>契約を終了すると、トレーナーのプランは使えなくなります（途中から再開はできません）。</p>
            <p>これまでの記録はそのまま残ります。記録から重量の基準を推定して、自分用のプログラムを自動で作るので、無料でそのまま続けられます。</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={endContract}
              disabled={ending}
              className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {ending ? '終了中...' : '契約を終了する'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={ending}
              className="flex-1 py-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-black dark:text-white"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
