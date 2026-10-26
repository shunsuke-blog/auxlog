import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/trainer/session'
import LoginForm from '@/components/auth/LoginForm'

// トレーナー用のログイン画面（2026-10-26）。トレーナー画面からのログアウト・ログインの期限切れもここに来る。
// 戻り先はトレーナー画面の中だけにする
export default async function TrainerLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams
  const requested = safeNextPath(rawNext)
  const next = requested.startsWith('/trainer') && !requested.startsWith('/trainer/login') ? requested : '/trainer/dashboard'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(next)

  return (
    <Suspense>
      <LoginForm
        next={next}
        subtitle={next.startsWith('/trainer/start') ? 'トレーナーとして始める' : 'トレーナー用の管理画面'}
        switchLink={{ href: '/login', label: 'クライアントの方はこちら' }}
        lightOnly
      />
    </Suspense>
  )
}
