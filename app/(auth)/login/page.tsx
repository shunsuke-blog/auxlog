'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Dumbbell, AlertCircle } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  auth: '認証に失敗しました。もう一度お試しください。',
}

function LoginContent() {
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? '予期しないエラーが発生しました。') : null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl}/auth/callback`,
      },
    })
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
                今日のメニューを、30秒で。
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
