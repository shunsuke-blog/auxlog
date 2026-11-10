import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/trainer/session'
import LoginForm from '@/components/auth/LoginForm'

// トレーナー用のログイン画面（2026-10-26）。トレーナー画面からのログアウト・ログインの期限切れもここに来る。
// 戻り先はトレーナー画面の中だけにする。
// 新規の人もここからアカウントを作るので、見出しは入口に関係なく「新規登録・ログイン」にする（2026-11-10 オーナー指摘。
// それまでは LP から来ると「トレーナーとして始める」、それ以外は「トレーナー用の管理画面」で、新規の人には「ログイン」しか見えなかった）
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
        subtitle="トレーナーの新規登録・ログイン"
        switchLink={{ href: '/login', label: 'クライアントの方はこちら' }}
        lightOnly
      />
    </Suspense>
  )
}
