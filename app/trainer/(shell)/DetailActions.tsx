'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TraineeRow } from '@/lib/trainer/trainees'
import LoginLinkShare from './LoginLinkShare'

type Props = { linkId: string; name: string; status: TraineeRow['status']; invite: TraineeRow['invite'] }

function usePost() {
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
  return { router, busy, error, post }
}

export default function DetailActions({ linkId, name, status, invite }: Props) {
  const { busy, error, post } = usePost()

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
          <div className="flex justify-end">
            <button onClick={issue} disabled={busy} className="text-sm text-black dark:text-white underline enabled:hover:text-zinc-500 disabled:opacity-50">
              {live ? 'リンクを作り直す' : '招待リンクを作る'}
            </button>
          </div>
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
          <div className="flex justify-end">
            <button onClick={issue} disabled={busy} className="text-sm text-black dark:text-white underline enabled:hover:text-zinc-500 disabled:opacity-50">
              {live ? 'リンクを作り直す' : 'ログイン用のリンクを作る'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

// 契約の終了・招待の取り消し。取り消せない操作なので、詳細の一番下に控えめに置く（2026-10-30 オーナーとの一覧の整理。
// それまではログイン用のリンクと今週のメニューの間に、横幅いっぱいで置いていた）。
// 詳細の操作のボタンは右寄せにそろえる（記録する・保存する・直すが右のため。2026-10-30 オーナー指摘）
export function EndContractButton({ linkId, status }: { linkId: string; status: TraineeRow['status'] }) {
  const { router, busy, error, post } = usePost()
  const endContract = () => {
    const message = status === 'invited'
      ? 'この招待を取り消しますか？送った招待リンクは使えなくなります。'
      : '契約を終了しますか？\nクライアントはこのプランを続けられなくなります。契約期間内の記録はこれまでどおり閲覧できます。'
    if (window.confirm(message)) post(`/api/contracts/${linkId}/end`).then(ok => { if (ok && status === 'invited') router.push('/trainer') })
  }
  if (status === 'ended') return null
  return (
    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 flex flex-col items-end gap-2">
      <button onClick={endContract} disabled={busy} className="px-4 py-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-500 cursor-pointer transition-colors hover:bg-red-50 hover:border-red-400 hover:text-red-600 active:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
        {status === 'invited' ? '招待を取り消す' : '契約を終了する'}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
