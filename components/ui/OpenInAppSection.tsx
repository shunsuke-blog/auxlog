'use client'

import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { APP_STORE_URL } from '@/lib/trainer/loginLink'

// ブラウザで使っているクライアントを iOS アプリへ移す（2026-11-07、ログイン用リンクの第2段階）。
// リンクで作ったアカウントは Apple・Google・メールが無いので、押した時に自分用の使い捨てのリンク（10分）を作ってアプリで開く。
// iPhone・iPad のブラウザの時だけ出す（Android のアプリはまだ出していない）。判定はサーバーで User-Agent から（呼ぶ側が出し分ける）
export default function OpenInAppSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app-login-link', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'うまくいきませんでした。もう一度お試しください')
      window.location.href = (data as { url: string }).url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした。もう一度お試しください')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400">iPhone のアプリで使う</h2>
      <div className="flex items-start gap-3">
        <Smartphone className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Auxlog のアプリを入れてから「アプリで開く」を押すと、今の記録のままアプリでログインします。
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={open}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium disabled:opacity-50"
        >
          {busy ? '準備しています…' : 'アプリで開く'}
        </button>
        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 dark:text-zinc-400 underline">
          App Store で入れる
        </a>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
