'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TrainerStartForm({ email }: { email: string | null }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'トレーナー登録に失敗しました')
      }
      router.replace('/trainer/dashboard')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'トレーナー登録に失敗しました')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        required
        maxLength={40}
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="表示名（例：山田トレーナー）"
        className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
      />
      <button
        type="submit"
        disabled={saving || !displayName.trim()}
        className="w-full px-6 py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium disabled:opacity-50"
      >
        {saving ? '登録中...' : 'トレーナーとして登録する'}
      </button>
      {email && <p className="text-xs text-zinc-400 text-center">{email} でログイン中</p>}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </form>
  )
}
