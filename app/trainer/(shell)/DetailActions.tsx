'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TraineeRow } from '@/lib/trainer/trainees'
import LoginLinkShare from './LoginLinkShare'

type Props = { linkId: string; name: string; status: TraineeRow['status']; invite: TraineeRow['invite'] }

export default function DetailActions({ linkId, name, status, invite }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
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

  const endContract = () => {
    const message = status === 'invited'
      ? 'この招待を取り消しますか？送った招待リンクは使えなくなります。'
      : '契約を終了しますか？\nクライアントはこのプランを続けられなくなります。契約期間内の記録はこれまでどおり閲覧できます。'
    if (window.confirm(message)) post(`/api/contracts/${linkId}/end`).then(ok => { if (ok && status === 'invited') router.push('/trainer') })
  }

  // ログイン用のリンク（2026-10-28。招待コードの代わり）。作り直すと前のリンクは使えなくなる
  const live = invite && !invite.expired ? invite : null
  const issue = () => {
    if (live && !window.confirm('リンクを作り直しますか？\n前に送ったリンクは使えなくなります。')) return
    post(`/api/trainer/trainees/${linkId}/login-link`)
  }

  return (
    <div className="space-y-3">
      {status === 'invited' && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <p className="text-xs font-semibold text-zinc-400">招待リンク</p>
          {live ? (
            <LoginLinkShare token={live.token} expiresAt={live.expiresAt} clientName={name} kind="invite" />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{invite ? '招待リンクの有効期限が切れています。' : '招待リンクがまだありません。'}</p>
          )}
          <button onClick={issue} disabled={busy} className="text-sm text-black dark:text-white underline enabled:hover:text-zinc-500 disabled:opacity-50">
            {live ? 'リンクを作り直す' : '招待リンクを作る'}
          </button>
        </div>
      )}

      {(status === 'active' || status === 'paused') && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <p className="text-xs font-semibold text-zinc-400">ログイン用のリンク</p>
          {live ? (
            <LoginLinkShare token={live.token} expiresAt={live.expiresAt} clientName={name} kind="relogin" />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              機種変更などで、クライアントがもう一度ログインする時に使います。リンクを押すと、登録なしで自分のメニューが開きます。
            </p>
          )}
          <button onClick={issue} disabled={busy} className="text-sm text-black dark:text-white underline enabled:hover:text-zinc-500 disabled:opacity-50">
            {live ? 'リンクを作り直す' : 'ログイン用のリンクを作る'}
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
