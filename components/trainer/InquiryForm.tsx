'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, X } from 'lucide-react'

// ビジネスプラン・トレーナー枠の追加のお問い合わせ（2026-10-26）。メールアプリは開かず、画面の中で送る。
// 名前・メールアドレスはログイン中の情報を API 側で付けるので、入力は人数と任意のメッセージだけ。
// sidePanelId を渡すと、PC（xl 以上。左のメニューがあるので lg では狭い）では入力欄をその要素（画面の右側）に開く（2026-10-28 オーナー指示）。スマホではその場に開く。
export default function InquiryForm({ kind, sidePanelId }: { kind: 'business' | 'seats'; sidePanelId?: string }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<HTMLElement | null>(null)
  const [trainers, setTrainers] = useState(kind === 'business' ? '3' : '1')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // 右側に開けるのは PC の幅の時だけ。幅が変わったら開き直さずに置き場所だけ移す
  useEffect(() => {
    if (!sidePanelId) return
    const mq = window.matchMedia('(min-width: 1280px)')
    const update = () => setSide(mq.matches ? document.getElementById(sidePanelId) : null)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [sidePanelId])

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
  const form = (
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

  if (!side) return form
  return (
    <>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">右側の欄からお送りください。</p>
      {createPortal(
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-black dark:text-white">{kind === 'business' ? 'ビジネスプランのお問い合わせ' : 'トレーナー枠のお問い合わせ'}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="p-1 -m-1 rounded-lg text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          {form}
        </div>,
        side,
      )}
    </>
  )
}
