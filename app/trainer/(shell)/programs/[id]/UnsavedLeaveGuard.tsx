'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// 未保存の変更があるまま移動しようとした時の確認（保存する／保存しない／キャンセル）
type PendingLeave = { saveIds: string[]; proceed: () => void }

// 未保存のまま画面内のリンク（サイドバーのタブなど）で離れようとしたら確認する。
// タブを閉じる・読み込み直す時はブラウザ標準の確認を出す。
// autoSave（自動保存、2026-10-29）: 確認せずに残りをその場で保存してから移り、保存できない時だけ確認する
export function useUnsavedLeaveGuard(dirty: ReadonlySet<string>, saveDays: (ids: string[]) => Promise<boolean>, discardDays: (ids: string[]) => void, autoSave = false) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingLeave | null>(null)

  useEffect(() => {
    if (dirty.size === 0) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      const href = a?.getAttribute('href')
      if (!a || !href || !href.startsWith('/') || a.target === '_blank') return
      e.preventDefault()
      e.stopPropagation()
      const leave = { saveIds: [...dirty], proceed: () => router.push(href) }
      if (autoSave) saveDays(leave.saveIds).then(ok => (ok ? leave.proceed() : setPending(leave)))
      else setPending(leave)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, router, autoSave, saveDays])

  const resolvePending = async (choice: 'save' | 'discard' | 'cancel') => {
    if (!pending) return
    if (choice === 'cancel') { setPending(null); return }
    if (choice === 'save') {
      const ok = await saveDays(pending.saveIds)
      if (!ok) { setPending(null); return }
    } else {
      discardDays(pending.saveIds)
    }
    const { proceed } = pending
    setPending(null)
    proceed()
  }

  // リンク以外で離れる時（取り込んだメニューの下書きの「戻る」、2026-10-28）に、同じ確認を出す
  const confirmLeave = (proceed: () => void) => setPending({ saveIds: [...dirty], proceed })

  return { pending, resolvePending, confirmLeave }
}

// message: 日数の代わりに出す説明（取り込んだメニューの下書き、2026-10-28）
// autoSave: 自動保存で保存できなかった時の確認（「保存する」は出さず、戻って直すか、保存せずに離れる）
export function UnsavedLeaveDialog({ pending, saving, label, message, autoSave = false, onResolve }: {
  pending: PendingLeave
  saving: boolean
  label: (dayId: string) => string
  message?: string
  autoSave?: boolean
  onResolve: (choice: 'save' | 'discard' | 'cancel') => void
}) {
  if (autoSave) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[20vh]">
        <div className="fixed inset-0 bg-black/60" onClick={() => onResolve('cancel')} />
        <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
          <p className="text-base font-semibold text-black dark:text-white">保存できていない変更があります</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => onResolve('cancel')} className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand">
              戻って直す
            </button>
            <button onClick={() => onResolve('discard')} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
              保存せずに離れる
            </button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={() => onResolve('cancel')} />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
        <p className="text-base font-semibold text-black dark:text-white">変更を保存しますか？</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {message ?? (pending.saveIds.length === 1 ? `${label(pending.saveIds[0])} に未保存の変更があります。` : `${pending.saveIds.length}日分の未保存の変更があります。`)}
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => onResolve('save')} disabled={saving} className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
            {saving ? '保存中…' : '保存する'}
          </button>
          <button onClick={() => onResolve('discard')} disabled={saving} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
            保存しない
          </button>
          <button onClick={() => onResolve('cancel')} disabled={saving} className="w-full py-3 rounded-xl text-sm text-zinc-500 hover:text-black dark:hover:text-white">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
