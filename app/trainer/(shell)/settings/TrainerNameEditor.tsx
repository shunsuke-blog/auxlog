'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// トレーナーの表示名の変更（2026-11-10）。クライアントの画面に出る名前なので、その旨を添える。
// 「変更」→ その場で入力。Enter で保存、Esc・「やめる」で取り消し
export default function TrainerNameEditor({ name }: { name: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = () => { setValue(name); setEditing(false); setError(null) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) { cancel(); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '表示名の変更に失敗しました')
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '表示名の変更に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-400">表示名（クライアントの画面に出る名前）</p>
          <p className="text-sm text-black dark:text-white truncate">{name}</p>
        </div>
        <button
          type="button"
          onClick={() => { setValue(name); setEditing(true) }}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-black hover:bg-zinc-50"
        >
          変更
        </button>
      </div>
    )
  }
  return (
    <form onSubmit={save} className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-zinc-400">表示名（クライアントの画面に出る名前）</span>
        <input
          autoFocus
          required
          value={value}
          maxLength={40}
          disabled={saving}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel() }}
          placeholder="表示名（例：山田トレーナー）"
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm text-black focus:outline-none focus:border-zinc-400"
        />
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cancel} disabled={saving} className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-black hover:bg-zinc-50 disabled:opacity-40">やめる</button>
        <button type="submit" disabled={saving || !value.trim()} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">{saving ? '保存中…' : '保存する'}</button>
      </div>
    </form>
  )
}
