'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { todayLocalDate } from '@/lib/utils/date'

type Props = {
  /** すでに契約中のトレーナーがいる場合はその名前（新しいコードは入力できない） */
  currentTrainerName: string | null
  hasSelfProgram: boolean
}

export default function InviteForm({ currentTrainerName, hasSelfProgram }: Props) {
  const router = useRouter()
  const [code, setCode] = useState('')
  // プランを始める日（過去の日付も選べる。週の日付の表示に使う）
  const [startDate, setStartDate] = useState(() => todayLocalDate())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '')

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized, start_date: startDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '招待コードの入力に失敗しました')
      try { sessionStorage.removeItem('auxlog_suggest_v1') } catch { /* ignore */ }
      router.replace('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '招待コードの入力に失敗しました')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-black dark:hover:text-white -ml-1 mb-1"
        >
          <ChevronLeft className="w-4 h-4" />
          戻る
        </button>
        <h1 className="text-xl font-semibold text-black dark:text-white">招待コードを入力</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">トレーナーから受け取った8文字のコードを入力してください</p>
      </div>

      <div className="px-6 py-8 max-w-md space-y-6">
        {currentTrainerName ? (
          <div className="px-5 py-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 space-y-1">
            <p className="text-sm font-semibold text-black dark:text-white">{currentTrainerName} さんと契約中です</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              新しい招待コードを入力するには、設定から今の契約を終了してください。
            </p>
          </div>
        ) : (
          <>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="例: ABCD2345"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              className="w-full px-4 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-center text-2xl font-mono tracking-[0.3em] text-black dark:text-white placeholder:text-zinc-300 placeholder:tracking-normal placeholder:text-base"
            />

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-black dark:text-white">プランを始める日</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-base text-black dark:text-white"
              />
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">すでに始めている場合は、過去の日付も選べます。</span>
            </label>

            <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5 leading-relaxed">
              <p>コードを入力すると、トレーナーが作ったプランに沿って記録するようになります。</p>
              {hasSelfProgram && <p>今のプログラムは終了します。これまでの記録はそのまま残ります。</p>}
              <p>契約はいつでも設定から終了できます。</p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting || normalized.length !== 8 || !startDate}
              className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40"
            >
              {submitting ? '確認中…' : 'コードを入力して始める'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
