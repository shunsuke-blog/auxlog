'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import type { TraineeRow } from '@/lib/trainer/trainees'
import LoginLinkShare from './LoginLinkShare'
import { ReassignSelect } from './team/TeamActions'

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

type LinkProps = { linkId: string; name: string; status: TraineeRow['status']; invite: TraineeRow['invite'] }

// ログイン用のリンク（2026-10-28。招待コードの代わり）。作り直すと前のリンクは使えなくなる。
// 招待中は詳細に常に出す（それが今やること）。契約中・一時停止は「･･･」のメニューから開く（機種変更の時だけ使う、2026-11-09）
export function LoginLinkCard({ linkId, name, status, invite }: LinkProps) {
  const { busy, error, post } = usePost()
  const live = invite && !invite.expired ? invite : null
  const issue = () => {
    if (live && !window.confirm('リンクを作り直しますか？\n前に送ったリンクは使えなくなります。')) return
    post(`/api/trainer/trainees/${linkId}/login-link`)
  }
  const invited = status === 'invited'

  return (
    <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
      <p className="text-xs font-semibold text-zinc-400">{invited ? '招待リンク' : 'ログイン用のリンク'}</p>
      {live ? (
        <LoginLinkShare token={live.token} expiresAt={live.expiresAt} clientName={name} kind={invited ? 'invite' : 'relogin'} />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {invited
            ? invite ? '招待リンクの有効期限が切れています。' : '招待リンクがまだありません。'
            : '機種変更などで、クライアントがもう一度ログインする時に使います。リンクを押すと、登録なしで自分のメニューが開きます。'}
        </p>
      )}
      <div className="flex justify-end">
        <button onClick={issue} disabled={busy} className="text-sm text-black dark:text-white underline enabled:hover:text-zinc-500 disabled:opacity-50">
          {live ? 'リンクを作り直す' : invited ? '招待リンクを作る' : 'ログイン用のリンクを作る'}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

type MenuProps = LinkProps & {
  /** チームの管理者の担当替え */
  reassign?: { currentTrainerId: string; trainers: { id: string; name: string }[] }
  /** 名前の変更・ログイン用リンク・契約の終了を出さない（チームの管理者がメンバーのクライアントを見る時） */
  readOnly?: boolean
  children: React.ReactNode
}

// クライアント詳細の見出し（名前・状態）と「･･･」のメニュー（2026-11-09 オーナーと整理）。
// たまにしか使わない操作（ログイン用のリンク・担当替え・契約の終了）はメニューに入れ、選んだ時だけ見出しの下に開く。
// 「･･･」は見出しの右端に固定（開いた中身で位置が動かない）
export default function DetailHeader({ linkId, name, status, invite, reassign, readOnly = false, children }: MenuProps) {
  const { router, busy, error, post } = usePost()
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<'link' | 'reassign' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // 契約の終了・招待の取り消し（取り消せないので確かめる）
  const endContract = () => {
    setMenuOpen(false)
    const message = status === 'invited'
      ? 'この招待を取り消しますか？送った招待リンクは使えなくなります。'
      : '契約を終了しますか？\nクライアントはこのプランを続けられなくなります。契約期間内の記録はこれまでどおり閲覧できます。'
    if (window.confirm(message)) post(`/api/contracts/${linkId}/end`).then(ok => { if (ok && status === 'invited') router.push('/trainer') })
  }

  const items: { key: string; label: string; onClick: () => void; danger?: boolean }[] = []
  if (!readOnly && (status === 'active' || status === 'paused')) {
    items.push({ key: 'link', label: 'ログイン用のリンク', onClick: () => { setPanel(p => (p === 'link' ? null : 'link')); setMenuOpen(false) } })
  }
  if (reassign && status !== 'ended' && reassign.trainers.length > 1) {
    items.push({ key: 'reassign', label: '担当替え', onClick: () => { setPanel(p => (p === 'reassign' ? null : 'reassign')); setMenuOpen(false) } })
  }
  if (!readOnly && status !== 'ended') {
    items.push({ key: 'end', label: status === 'invited' ? '招待を取り消す' : '契約を終了する', onClick: endContract, danger: true })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {items.length > 0 && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(o => !o)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="そのほかの操作"
              className="p-2 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-1 z-20 min-w-44 py-1 rounded-xl trainer-card shadow-card">
                {items.map(i => (
                  <button
                    key={i.key}
                    role="menuitem"
                    onClick={i.onClick}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 ${i.danger ? 'text-red-500' : 'text-black dark:text-white'}`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {panel === 'link' && <LoginLinkCard linkId={linkId} name={name} status={status} invite={invite} />}
      {panel === 'reassign' && reassign && <ReassignSelect linkId={linkId} currentTrainerId={reassign.currentTrainerId} trainers={reassign.trainers} />}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
