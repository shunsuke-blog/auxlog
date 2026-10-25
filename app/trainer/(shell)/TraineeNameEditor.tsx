'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

// 契約者の名前の変更（2026-10-25 オーナー決定「案A」）。名前はトレーナーだけが見る呼び名で、トレーニー側には出ない。
// ペンのボタン → その場で入力。Enter・欄の外で保存、Esc で取り消し（プログラム名の変更と同じ）
export default function TraineeNameEditor({ linkId, name }: { linkId: string; name: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = () => { setValue(name); setEditing(false); setError(null) }

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) { cancel(); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/trainer/trainees/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '名前の変更に失敗しました')
      setEditing(false)
      setError(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '名前の変更に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          autoFocus
          value={value}
          maxLength={40}
          disabled={saving}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            // 日本語入力の変換を確定する Enter では保存しない
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
            if (e.key === 'Escape') cancel()
          }}
          className="w-full max-w-sm px-2 py-1 -ml-2 rounded-lg border border-zinc-300 bg-white text-xl font-semibold text-black focus:outline-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <h2 className="text-xl font-semibold text-black dark:text-white truncate">{name}</h2>
      <button
        type="button"
        onClick={() => { setValue(name); setEditing(true) }}
        title="名前を変更"
        aria-label="名前を変更"
        className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-100 cursor-pointer"
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}
