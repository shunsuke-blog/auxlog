'use client'

import { useState } from 'react'
import Link from 'next/link'

export type Item = { linkId: string; name: string; text: string }

// ダッシュボードの一番上の「対応すること」（2026-10-26 オーナー承認）。アラートとToDoの件数と上位3件ずつだけ出し、
// 残りは「ほかN件を表示」で開く。何もない日は1行だけにして、下の数字のカードを押し下げない。
const VISIBLE = 3

export default function ActionBand({ alerts, todos }: { alerts: Item[]; todos: Item[] }) {
  const [open, setOpen] = useState(false)
  const hidden = Math.max(0, alerts.length - VISIBLE) + Math.max(0, todos.length - VISIBLE)

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
        <Group title="アラート" items={alerts} open={open} urgent />
        <Group title="ToDo" items={todos} open={open} />
      </div>
    </section>
  )
}

function Group({ title, items, open, urgent }: { title: string; items: Item[]; open: boolean; urgent?: boolean }) {
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, VISIBLE)
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-black dark:text-white">
        {title}<span className="ml-1.5 text-zinc-500 font-normal tabular-nums">{items.length}件</span>
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {shown.map((it, i) => (
          <li key={`${it.linkId}-${i}`}>
            <Link href={`/trainer?id=${it.linkId}`} className="block py-2.5 text-sm text-black dark:text-white hover:underline">
              <span className="font-semibold">{it.name}</span>
              <span className={urgent ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}>: {it.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
