'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// 未保存の変更があるまま移動しようとした時の確認（保存する／保存しない／キャンセル）
type PendingLeave = { saveIds: string[]; proceed: () => void }

// 未保存のまま画面内のリンク（サイドバーのタブなど）で離れようとしたら確認する。
// タブを閉じる・読み込み直す時はブラウザ標準の確認を出す。
export function useUnsavedLeaveGuard(dirty: ReadonlySet<string>, saveDays: (ids: string[]) => Promise<boolean>, discardDays: (ids: string[]) => void) {
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
      setPending({ saveIds: [...dirty], proceed: () => router.push(href) })
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, router])

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

  return { pending, resolvePending }
}

export function UnsavedLeaveDialog({ pending, saving, label, onResolve }: {
  pending: PendingLeave
  saving: boolean
  label: (dayId: string) => string
  onResolve: (choice: 'save' | 'discard' | 'cancel') => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={() => onResolve('cancel')} />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
        <p className="text-base font-semibold text-black dark:text-white">変更を保存しますか？</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {pending.saveIds.length === 1 ? `${label(pending.saveIds[0])} に未保存の変更があります。` : `${pending.saveIds.length}日分の未保存の変更があります。`}
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => onResolve('save')} disabled={saving} className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
            {saving ? '保存中...' : '保存する'}
          </button>
          <button onClick={() => onResolve('discard')} disabled={saving} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-red-500">
            保存しない
          </button>
          <button onClick={() => onResolve('cancel')} disabled={saving} className="w-full py-3 text-sm text-zinc-500">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
