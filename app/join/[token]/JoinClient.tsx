'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { LoginLinkState } from '@/lib/trainer/loginLink'

type Props = {
  token: string
  state: LoginLinkState
  /** invite: 招待中（アカウントを作って始める）、relogin: 契約中のクライアントのログイン（機種変更など） */
  kind: 'invite' | 'relogin'
  clientName: string
  trainerName: string
  /** ログイン中のアカウント（email は仮のアドレスなら null） */
  signedIn: { email: string | null; isLinkTrainer: boolean } | null
}

const INVALID_MESSAGES: Record<Exclude<LoginLinkState, 'valid'>, string> = {
  used: 'このリンクはすでに使われています。別のスマホなどで開く時は、トレーナーに新しいリンクをお願いしてください。',
  expired: 'このリンクの有効期限（14日）が切れています。トレーナーに新しいリンクをお願いしてください。',
  revoked: '新しいリンクが作られたため、このリンクは使えません。トレーナーから届いた一番新しいリンクを開いてください。',
  ended: 'トレーナーとの契約が終わっているため、このリンクは使えません。',
  not_found: 'リンクが正しくありません。LINE などで届いたリンクを、もう一度そのまま開いてください。',
}

const primary = 'w-full px-6 py-3.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium disabled:opacity-50'
const secondary = 'w-full px-6 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50'

// ログイン用リンクを開いた時の画面（2026-10-28）。ボタンを押すまで何もしない（LINE のプレビューでリンクを使い切らない）
export default function JoinClient({ token, state, kind, clientName, trainerName, signedIn }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async (mode: 'start' | 'accept') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/join/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'うまくいきませんでした。もう一度お試しください')
      router.replace('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした。もう一度お試しください')
      setBusy(false)
    }
  }

  // ログイン中の別のアカウントから抜けて、このリンクで始める
  const signOutAndStart = async () => {
    setBusy(true)
    await createClient().auth.signOut()
    await join('start')
  }

  const terms = (
    <p className="text-center text-xs text-zinc-400 leading-relaxed">
      押すと、
      <a href="https://auxlog.com/terms" target="_blank" rel="noopener noreferrer" className="underline">利用規約</a>
      と
      <a href="https://auxlog.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">プライバシーポリシー</a>
      に同意したものとみなされます。
    </p>
  )

  let title: string
  let body: React.ReactNode
  if (state !== 'valid') {
    title = 'このリンクは使えません'
    body = (
      <div className="space-y-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">{INVALID_MESSAGES[state]}</p>
        <Link href="/login" className={`${secondary} block text-center`}>ログイン画面へ</Link>
      </div>
    )
  } else if (signedIn?.isLinkTrainer) {
    title = 'クライアント用のリンクです'
    body = (
      <div className="space-y-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
          これは {clientName} さんのために作ったリンクです。LINE などで {clientName} さんに送ってください（ここで押すと、あなたが使ってしまいます）。
        </p>
        <Link href="/trainer" className={`${secondary} block text-center`}>トレーナー画面に戻る</Link>
      </div>
    )
  } else if (kind === 'invite' && signedIn) {
    // すでに Auxlog のアカウントがある人: そのアカウントで受け取る（今までの招待コードの入力の代わり）
    title = `${trainerName}さんからメニューが届いています`
    body = (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
          ログイン中のアカウント{signedIn.email ? `（${signedIn.email}）` : ''}で受け取ります。今のセルフのプログラムは終了します（記録は残ります）。
        </p>
        <button onClick={() => join('accept')} disabled={busy} className={primary}>{busy ? '受け取っています…' : 'このアカウントで受け取る'}</button>
        <button onClick={signOutAndStart} disabled={busy} className={secondary}>ログアウトして、新しくはじめる</button>
      </div>
    )
  } else if (kind === 'invite') {
    title = `${clientName}さん、ようこそ`
    body = (
      <div className="space-y-5">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
          {trainerName}さんから、トレーニングのメニューが届いています。登録やパスワードは不要です。
        </p>
        <div className="space-y-3">
          <button onClick={() => join('start')} disabled={busy} className={primary}>{busy ? '準備しています…' : 'はじめる'}</button>
          {terms}
        </div>
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900 text-center space-y-1">
          <p className="text-xs text-zinc-400">すでに Auxlog をお使いの方</p>
          <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="text-sm text-black dark:text-white underline hover:text-zinc-500">
            ログインしてから受け取る
          </Link>
        </div>
      </div>
    )
  } else {
    // 契約中のクライアントのログイン（機種変更など）
    title = `${clientName}さん、おかえりなさい`
    body = (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
          {signedIn ? '別のアカウントでログイン中です。ログアウトしてから、あなたのメニューを開きます。' : 'ボタンを押すと、あなたのメニューが開きます。'}
        </p>
        <button onClick={signedIn ? signOutAndStart : () => join('start')} disabled={busy} className={primary}>
          {busy ? 'ログインしています…' : signedIn ? 'ログアウトしてログインする' : 'ログインする'}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/app-icon.png" alt="" width={56} height={56} className="rounded-2xl" priority />
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-white">{title}</h1>
        </div>
        <div className="w-full">{body}</div>
        {error && (
          <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
