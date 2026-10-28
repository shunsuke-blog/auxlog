import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { tokyoToday, type LoginLinkPeek } from '@/lib/trainer/loginLink'

const JoinSchema = z.object({ mode: z.enum(['start', 'accept']) })

const invalid = () => NextResponse.json({ error: 'このリンクは使えません。トレーナーに新しいリンクをお願いしてください', reason: 'login_link_invalid' }, { status: 409 })

// ログイン用リンクを使う（2026-10-28）。ページを開いただけ（LINE のプレビューなど）では使わず、ボタンを押した時だけ呼ぶ。
// - start: ログインしていない人。招待中ならアカウントを作って契約を始め、契約中ならその人としてログインする（cookie にセッションを入れる）
// - accept: すでにログインしている人が、そのアカウントで受け取る（今までの招待コードの入力と同じ）
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const parsed = JoinSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  if (parsed.data.mode === 'accept') {
    const supabase = await createClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { error } = await supabase.rpc('redeem_trainee_login_link', { p_token: token, p_start_date: tokyoToday() })
    if (error) return trainerRpcError(error, '受け取りに失敗しました')
    return NextResponse.json({ ok: true })
  }

  const service = createServiceClient()
  const { data: peek, error: peekError } = await service.rpc('peek_trainee_login_link', { p_token: token })
  if (peekError) return trainerRpcError(peekError, 'ログインに失敗しました')
  const link = peek as LoginLinkPeek
  if (link.state !== 'valid') return invalid()

  // ログインする人: 招待中なら新しいアカウント（メールは届かない仮のアドレス）、契約中ならその枠のクライアント
  let userId: string
  let email: string
  let created = false
  if (link.link_status === 'invited') {
    email = `client-${randomUUID()}@clients.auxlog.app`
    const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, user_metadata: { created_by: 'login_link' } })
    if (error || !data.user) return NextResponse.json({ error: 'アカウントの作成に失敗しました。もう一度お試しください' }, { status: 500 })
    userId = data.user.id
    created = true
  } else {
    const { data, error } = await service.auth.admin.getUserById(link.trainee_id ?? '')
    if (error || !data.user?.email) return invalid()
    userId = data.user.id
    email = data.user.email
  }

  const undo = async () => { if (created) await service.auth.admin.deleteUser(userId) }

  // 先にセッションを作る（リンクを使い切った後でログインに失敗すると、やり直せなくなるため）
  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !linkData.properties?.hashed_token) { await undo(); return NextResponse.json({ error: 'ログインに失敗しました。もう一度お試しください' }, { status: 500 }) }
  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties.hashed_token })
  if (verifyError) { await undo(); return NextResponse.json({ error: 'ログインに失敗しました。もう一度お試しください' }, { status: 500 }) }

  const { error: useError } = await service.rpc('use_trainee_login_link', { p_token: token, p_user_id: userId, p_start_date: tokyoToday() })
  if (useError) {
    await supabase.auth.signOut()
    await undo()
    return useError.hint === 'login_link_invalid' ? invalid() : trainerRpcError(useError, 'ログインに失敗しました')
  }
  return NextResponse.json({ ok: true })
}
