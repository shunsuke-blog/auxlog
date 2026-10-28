import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { LoginLinkPeek } from '@/lib/trainer/loginLink'
import JoinClient from './JoinClient'

// LINE などのプレビューに名前を出さない。検索にも載せない
export const metadata: Metadata = {
  title: 'Auxlog',
  description: 'トレーナーからのメニューが届いています',
  robots: { index: false, follow: false },
}

// クライアントのログイン用リンク（2026-10-28）。開いただけでは何もしない（LINE のプレビューがこのページを読むため）。
// ボタンを押した時だけ /api/join/[token] でアカウントを作る・ログインする・受け取る
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [{ data: peek }, supabase] = await Promise.all([
    createServiceClient().rpc('peek_trainee_login_link', { p_token: token }),
    createClient(),
  ])
  const link = (peek ?? { state: 'not_found' }) as LoginLinkPeek
  const { data: { user } } = await supabase.auth.getUser()

  // もう本人としてログインしている（使用済みのリンクを開き直した・契約中に作り直したリンクを開いた）ならホームへ
  if (user && link.trainee_id && user.id === link.trainee_id) redirect('/')

  return (
    <JoinClient
      token={token}
      state={link.state}
      kind={link.link_status === 'invited' ? 'invite' : 'relogin'}
      clientName={link.client_name ?? ''}
      trainerName={link.trainer_name ?? 'トレーナー'}
      // ログイン中の別のアカウント。トレーナー本人が自分の作ったリンクを開いた時は、そう伝える
      signedIn={user ? { email: user.email?.endsWith('@clients.auxlog.app') ? null : user.email ?? null, isLinkTrainer: user.id === link.trainer_id } : null}
    />
  )
}
