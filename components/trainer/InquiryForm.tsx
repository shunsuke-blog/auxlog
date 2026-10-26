'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

// ビジネスプラン・トレーナー枠の追加のお問い合わせ（2026-10-26）。メールアプリは開かず、画面の中で送る。
// 名前・メールアドレスはログイン中の情報を API 側で付けるので、入力は人数と任意のメッセージだけ。
export default function InquiryForm({ kind }: { kind: 'business' | 'seats' }) {
  const [open, setOpen] = useState(false)
  const [trainers, setTrainers] = useState(kind === 'business' ? '3' : '1')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (sent) {
    return <p className="text-sm text-black dark:text-white">送信しました。ご登録のメールアドレスに、運営からご連絡します。</p>
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer">
        お問い合わせ<ChevronRight className="w-4 h-4" />
      </button>
    )
  }

  const count = Number(trainers)
  const valid = Number.isInteger(count) && count >= 1 && count <= 999
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, trainers: count, message: message.trim() || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '送信に失敗しました')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none'
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <span>{kind === 'business' ? 'ご利用予定のトレーナーの人数（あなたを含む）' : '追加したいトレーナーの人数'}</span>
        <span className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={1} max={999} required value={trainers} onChange={e => setTrainers(e.target.value)} className={`${inputClass} w-24 tabular-nums`} />
          <span className="text-sm text-black dark:text-white">名</span>
        </span>
      </label>
      <label className="block text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <span>ご質問など（任意）</span>
        <textarea rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className={`${inputClass} w-full resize-none`} />
      </label>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">お名前とメールアドレスは、ログイン中の情報でお送りします。</p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={busy || !valid} className="h-11 px-5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? '送信中…' : '送信する'}
      </button>
    </form>
  )
}
