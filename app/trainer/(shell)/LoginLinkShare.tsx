'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { loginLinkMessage, loginLinkUrl } from '@/lib/trainer/loginLink'

const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// クライアントのログイン用リンクを送る（2026-10-28）。文章をコピーして LINE などに貼る。
// 「LINE で送る」ボタンは、PC では LINE のトップページに飛ぶだけだったので置かない（2026-10-28 オーナー判断）
// kind: invite は招待（初めて）、relogin は契約中のクライアントのログイン（機種変更など）
export default function LoginLinkShare({ token, expiresAt, clientName, kind }: { token: string; expiresAt: string; clientName: string; kind: 'invite' | 'relogin' }) {
  // 手元・プレビューで開いた時も、その場所のリンクにする（サーバーで描く時は本番のアドレス）
  const [origin] = useState(() => (typeof window === 'undefined' ? 'https://auxlog.app' : window.location.origin))
  const [copied, setCopied] = useState(false)

  const url = loginLinkUrl(origin, token)
  const message = loginLinkMessage(url, clientName, kind)

  const copy = async () => {
    await navigator.clipboard.writeText(message).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3">
      <p suppressHydrationWarning className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500 dark:text-zinc-400 break-all font-mono">{url}</p>
      <button type="button" onClick={copy} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'コピーしました' : '文章をコピー（LINE などに貼って送る）'}
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {fmt(expiresAt)} まで（14日間）、1回だけ使えます。クライアントがリンクを押すと、登録なしで自分のメニューが開きます。
      </p>
    </div>
  )
}
