'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import type { TraineeRow } from '@/lib/trainer/trainees'

type Props = { linkId: string; status: TraineeRow['status']; invite: TraineeRow['invite'] }

const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function DetailActions({ linkId, status, invite }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async (url: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '操作に失敗しました')
      }
      router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作に失敗しました')
      return false
    } finally {
      setBusy(false)
    }
  }

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const endContract = () => {
    const message = status === 'invited'
      ? 'この招待を取り消しますか？発行した招待コードは使えなくなります。'
      : '契約を終了しますか？\nクライアントはこのプランを続けられなくなります。契約期間内の記録はこれまでどおり閲覧できます。'
    if (window.confirm(message)) post(`/api/contracts/${linkId}/end`).then(ok => { if (ok && status === 'invited') router.push('/trainer') })
  }

  return (
    <div className="space-y-3">
      {status === 'invited' && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">招待コード</p>
          {invite && !invite.expired ? (
            <>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold tracking-[0.2em] tabular-nums text-black dark:text-white">{invite.code}</p>
                <button onClick={() => copy(invite.code)} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmt(invite.expiresAt)} まで有効。クライアントに伝えて、Auxlog で入力してもらってください。</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">招待コードの有効期限が切れています。</p>
          )}
          <button onClick={() => post(`/api/trainer/trainees/${linkId}/reissue`)} disabled={busy} className="text-sm text-black dark:text-white underline disabled:opacity-50">
            招待コードを再発行する
          </button>
        </div>
      )}

      {status !== 'ended' && (
        <button onClick={endContract} disabled={busy} className="w-full py-3 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-500 cursor-pointer transition-colors hover:bg-red-50 hover:border-red-400 hover:text-red-600 active:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
          {status === 'invited' ? '招待を取り消す' : '契約を終了する'}
        </button>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
