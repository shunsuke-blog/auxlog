'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PaidPlan } from '@/lib/trainer/billing'

// Stripe のお支払いページ（申し込み）・お客様ポータル（管理）へ移るボタン。URL はサーバーで作る
export default function BillingButton({ kind, label, primary, plan }: { kind: 'checkout' | 'portal'; label: string; primary?: boolean; plan?: PaidPlan }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trainer/billing/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan ? { plan } : {}) })
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

// 有料プラン同士の切り替え（日割りで差額を次の請求で精算）。サーバーがその場でプランも反映する
export function ChangePlanButton({ plan, label, confirmMessage }: { plan: PaidPlan; label: string; confirmMessage: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = async () => {
    if (!window.confirm(confirmMessage)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/billing/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'プランを切り替えられませんでした')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プランを切り替えられませんでした')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <button onClick={change} disabled={busy} className="w-full h-11 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? '切り替えています…' : label}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
