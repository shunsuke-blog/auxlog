'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { otpSendErrorMessage } from '@/lib/auth/otp_error'
import { AlertCircle, Mail } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  auth: '認証に失敗しました。もう一度お試しください。',
}

// Supabase は同じメールアドレスへの再送信を60秒あけないと断るので、再送のボタンもそれまで押せなくする
const RESEND_INTERVAL_SECONDS = 60

type Props = {
  next: string
  subtitle: string
  // トレーナー用（/trainer/login）とクライアント用（/login）を行き来するリンク
  switchLink: { href: string; label: string }
  // トレーナー画面と同じく、端末がダークモードでもライトで出す
  lightOnly?: boolean
}

// ログイン画面の中身。クライアント用の /login とトレーナー用の /trainer/login で共通（2026-10-26 分けた。
// それまではトレーナー画面からログアウトするとクライアント向けの /login が出ていた）。
// アカウントの作成も兼ねる（Google・メールとも、無ければ作られる）。
export default function LoginForm({ next, subtitle, switchLink, lightOnly }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? '予期しないエラーが発生しました。') : null

  // メールアドレスでのログイン。メールに届く数字のコードを入力する方式（リンク方式だと、PCで待っている
  // のにスマホでメールを開くとスマホ側でログインしてしまうため。2026-10-19 決定）
  // コードを送った先は URL（?sent=）に持たせる。スマホでメールアプリに切り替えると Safari がページを
  // 読み込み直すことがあり、画面の状態だけだとメールアドレスの入力に戻ってしまうため
  const sentTo = searchParams.get('sent')
  const [email, setEmail] = useState(sentTo ?? '')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(!!sentTo)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const handleGoogleLogin = async () => {
    // 戻り先はボタンを押した時に決める（描画中に window を読むと、サーバー側の描画でエラーになる。
    // 本番は NEXT_PUBLIC_APP_URL があるので起きないが、ローカルでは「window is not defined」になっていた）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  const sendCode = async () => {
    setEmailBusy(true)
    setEmailError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setEmailBusy(false)
    if (error) {
      // 待つ秒数が返ってきた時は、再送のボタンの数え下げに使う
      const seconds = Number(error.message?.match(/after (\d+) seconds?/)?.[1])
      if (seconds) setResendIn(seconds)
      setEmailError(otpSendErrorMessage(error))
      return false
    }
    setResendIn(RESEND_INTERVAL_SECONDS)
    return true
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!(await sendCode())) return
    setCodeSent(true)
    setLoginParam('sent', email.trim())
  }

  const handleResend = async () => {
    setCode('')
    await sendCode()
  }

  const setLoginParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('error')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
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

  const resetEmail = () => {
    setCodeSent(false)
    setCode('')
    setEmailError(null)
    setLoginParam('sent', null)
  }

  return (
    <div className={`${lightOnly ? 'light-only ' : ''}min-h-screen flex items-center justify-center bg-white dark:bg-black px-6 py-10`}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-3">
            <Image src="/app-icon.png" alt="" width={56} height={56} className="rounded-2xl" priority />
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
                Auxlog
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{subtitle}</p>
            </div>
          </div>

          {errorMessage && (
            <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <div className="w-full">
            {!codeSent ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-black dark:text-white text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Googleで続ける
                </button>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-900" />
                  <span className="text-xs text-zinc-400">または</span>
                  <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-900" />
                </div>

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
                    {emailBusy ? '送信中…' : 'メールでログインコードを受け取る'}
                  </button>
                </form>

                {emailError && <p className="mt-3 text-sm text-red-500 text-center">{emailError}</p>}

                <div className="mt-6 space-y-1.5 text-center text-xs text-zinc-400 leading-relaxed">
                  <p>アカウントが無い場合は自動で作成されます。</p>
                  <p>
                    続けると、
                    <a href="https://auxlog.com/terms" target="_blank" rel="noopener noreferrer" className="underline">利用規約</a>
                    と
                    <a href="https://auxlog.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">プライバシーポリシー</a>
                    に
                    <br />
                    同意したものとみなされます。
                  </p>
                </div>
              </>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed">
                  {email} にログインコードを送りました。<br />メールに記載の数字を入力してください。
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={10}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="コード"
                  className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center text-lg tracking-[0.4em] tabular-nums text-black dark:text-white placeholder:text-zinc-300 focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="submit"
                  disabled={emailBusy || code.length < 6}
                  className="w-full px-6 py-3.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium disabled:opacity-50"
                >
                  {emailBusy ? '確認中…' : 'ログイン'}
                </button>
                {emailError && <p className="text-sm text-red-500 text-center">{emailError}</p>}
                <div className="flex items-center justify-center gap-4 pt-1 text-xs">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={emailBusy || resendIn > 0}
                    className="text-zinc-500 dark:text-zinc-400 hover:underline disabled:text-zinc-300 disabled:no-underline dark:disabled:text-zinc-600 tabular-nums"
                  >
                    {resendIn > 0 ? `コードを再送する（${resendIn}秒後）` : 'コードを再送する'}
                  </button>
                  <button type="button" onClick={resetEmail} className="text-zinc-400 hover:underline">
                    メールアドレスを入力し直す
                  </button>
                </div>
              </form>
            )}
          </div>

          {!codeSent && (
            <Link href={switchLink.href} className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline">
              {switchLink.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
