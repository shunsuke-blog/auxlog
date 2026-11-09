'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/** ackKey があるアラートは「確認した」で消せる（2026-11-09 オーナー決定: トレーナーごと、状態が変わればまた出る） */
export type Item = { linkId: string; name: string; text: string; ackKey?: string }

// ダッシュボードの一番上の「対応すること」（2026-10-26 オーナー承認）。アラートとToDoの件数と上位3件ずつだけ出し、
// 残りは「ほかN件を表示」で開く。何もない日は1行だけにして、下の数字のカードを押し下げない。
const VISIBLE = 3

export default function ActionBand({ alerts: allAlerts, todos }: { alerts: Item[]; todos: Item[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // 押したらすぐ消す（保存は後ろで。失敗したら戻す）
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const alerts = allAlerts.filter(a => !a.ackKey || !acked.has(`${a.linkId}:${a.ackKey}`))
  const hidden = Math.max(0, alerts.length - VISIBLE) + Math.max(0, todos.length - VISIBLE)

  const ack = async (item: Item) => {
    if (!item.ackKey) return
    const id = `${item.linkId}:${item.ackKey}`
    setAcked(prev => new Set(prev).add(id))
    setError(null)
    try {
      const res = await fetch('/api/trainer/alert-acks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_id: item.linkId, alert_key: item.ackKey }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      setAcked(prev => { const n = new Set(prev); n.delete(id); return n })
      setError('確認済みにできませんでした。もう一度お試しください')
    }
  }

  if (alerts.length === 0 && todos.length === 0) {
    return (
      <section className="px-4 md:px-5 py-3 rounded-2xl trainer-card">
        <p className="text-sm text-zinc-500">対応することはありません。</p>
      </section>
    )
  }

  return (
    <section className="px-4 md:px-5 py-4 rounded-2xl trainer-card space-y-3">
      {/* 開く・閉じるボタンは見出しの右に置き、押した後もマウスの位置を変えずに押し直せるようにする（2026-10-26 オーナー指摘） */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-zinc-400">対応すること</h2>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="text-sm font-medium text-brand-text hover:underline"
          >
            {open ? '閉じる' : `ほか${hidden}件を表示`}
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {/* アラート（トレーニーの様子の異変）を先、ToDo（トレーナーがやる作業）を後に */}
        <Group title="アラート" items={alerts} open={open} urgent onAck={ack} />
        <Group title="ToDo" items={todos} open={open} />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </section>
  )
}

function Group({ title, items, open, urgent, onAck }: { title: string; items: Item[]; open: boolean; urgent?: boolean; onAck?: (item: Item) => void }) {
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, VISIBLE)
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-black dark:text-white">
        {title}<span className="ml-1.5 text-zinc-500 font-normal tabular-nums">{items.length}件</span>
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {shown.map((it, i) => (
          <li key={`${it.linkId}-${it.ackKey ?? i}`} className="flex items-center gap-3">
            <Link href={`/trainer?id=${it.linkId}`} className="flex-1 min-w-0 py-2.5 text-sm text-black dark:text-white hover:underline">
              <span className="font-semibold">{it.name}</span>
              <span className={urgent ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}>: {it.text}</span>
            </Link>
            {/* 連絡した・様子を見たら消す（クライアントの状態が変わればまた出る） */}
            {onAck && it.ackKey && (
              <button type="button" onClick={() => onAck(it)} className="shrink-0 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 hover:text-black hover:bg-zinc-50 dark:hover:text-white dark:hover:bg-zinc-900">
                確認した
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
