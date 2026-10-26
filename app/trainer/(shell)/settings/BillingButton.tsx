'use client'

import { useState } from 'react'

// Stripe のお支払いページ（申し込み）・お客様ポータル（管理）へ移るボタン。URL はサーバーで作る
export default function BillingButton({ kind, label, primary }: { kind: 'checkout' | 'portal'; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trainer/billing/${kind}`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'ページを開けませんでした')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ページを開けませんでした')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={busy}
        className={`w-full h-11 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          primary ? 'bg-brand hover:bg-brand-hover text-on-brand' : 'border border-zinc-200 bg-white text-black hover:bg-zinc-50'
        }`}
      >
        {busy ? '開いています…' : label}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
