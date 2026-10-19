'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/trainer/session'
import { Dumbbell, AlertCircle, Mail } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  auth: '認証に失敗しました。もう一度お試しください。',
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? '予期しないエラーが発生しました。') : null
  // トレーナーの入口（/trainer/start）などから来た場合は、ログイン後にそこへ戻す
  const next = safeNextPath(searchParams.get('next'))
  const isTrainerEntry = next.startsWith('/trainer')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin

  // メールアドレスでのログイン。メールに届く6桁のコードを入力する方式（リンク方式だと、PCで待っている
  // のにスマホでメールを開くとスマホ側でログインしてしまうため。2026-10-19 決定）
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailBusy(true)
    setEmailError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setEmailBusy(false)
    if (error) {
      setEmailError('コードを送信できませんでした。メールアドレスを確認して、しばらくしてからもう一度お試しください。')
      return
    }
    setCodeSent(true)
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailBusy(true)
    setEmailError(null)
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    if (error) {
      setEmailBusy(false)
      setEmailError('コードが正しくないか、有効期限が切れています。')
      return
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-black dark:bg-white flex items-center justify-center">
              <Dumbbell className="w-7 h-7 text-white dark:text-black" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
                Auxlog
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {isTrainerEntry ? 'トレーナーとして始める' : '今日のメニューを、30秒で。'}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <div className="w-full">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-black dark:text-white text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Googleでログイン
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-900" />
              <span className="text-xs text-zinc-400">または</span>
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-900" />
            </div>

            {!codeSent ? (
              <form onSubmit={handleSendCode} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="メールアドレス"
                  className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="submit"
                  disabled={emailBusy || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {emailBusy ? '送信中...' : 'メールでログインコードを受け取る'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed">
                  {email} に6桁のコードを送りました。<br />メールに記載のコードを入力してください。
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center text-lg tracking-[0.4em] tabular-nums text-black dark:text-white placeholder:text-zinc-300 focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="submit"
                  disabled={emailBusy || code.length !== 6}
                  className="w-full px-6 py-3.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium disabled:opacity-50"
                >
                  {emailBusy ? '確認中...' : 'ログイン'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCodeSent(false); setCode(''); setEmailError(null) }}
                  className="w-full text-xs text-zinc-400 hover:underline"
                >
                  メールアドレスを入力し直す
                </button>
              </form>
            )}

            {emailError && <p className="mt-3 text-sm text-red-500 text-center">{emailError}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
