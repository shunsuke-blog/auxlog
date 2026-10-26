import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { safeNextPath } from '@/lib/trainer/session'
import LoginForm from '@/components/auth/LoginForm'

// クライアント（トレーニー）用のログイン画面。トレーナー画面へ戻る人（LP の「ログイン」など ?next=/trainer…）は
// トレーナー用の /trainer/login へ回す（2026-10-26）
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  if (next.startsWith('/trainer')) {
    const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] != null))
    redirect(`/trainer/login?${qs}`)
  }

  // Web でクライアントが来るのは、ほとんどがトレーナーからの招待（/invite）から
  const subtitle = next.startsWith('/invite')
    ? 'トレーナーからの招待を受け取るには、ログインしてください。'
    : '「なんとなく」のトレーニングから卒業しよう。'

  return (
    <Suspense>
      <LoginForm
        next={next}
        subtitle={subtitle}
        switchLink={{ href: '/trainer/login', label: 'トレーナーの方はこちら' }}
      />
    </Suspense>
  )
}
