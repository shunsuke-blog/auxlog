import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient, createStatelessClient } from '@/lib/supabase/server'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { isLinkOnlyEmail, tokyoToday, type LoginLinkPeek } from '@/lib/trainer/loginLink'

// client: app はモバイルアプリから（2026-11-07）。cookie ではなく、できたセッションのトークンを返す
const JoinSchema = z.object({ mode: z.enum(['start', 'accept']), client: z.enum(['web', 'app']).optional() })

const invalid = () => NextResponse.json({ error: 'このリンクは使えません。トレーナーに新しいリンクをお願いしてください', reason: 'login_link_invalid' }, { status: 409 })

// リンクの中身を見る（使わない）。モバイルアプリの「ようこそ」の画面用で、Web の app/join/[token]/page.tsx と同じ（2026-11-07）。
// ログイン中なら Authorization: Bearer で送られてくる
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient(request)
  const [{ data: peek }, { data: { user } }] = await Promise.all([
    createServiceClient().rpc('peek_trainee_login_link', { p_token: token }),
    request.headers.get('authorization') ? supabase.auth.getUser() : Promise.resolve({ data: { user: null } }),
  ])
  const link = (peek ?? { state: 'not_found' }) as LoginLinkPeek
  return NextResponse.json({
    state: link.state,
    kind: link.link_status === 'invited' ? 'invite' : 'relogin',
    clientName: link.client_name ?? '',
    trainerName: link.trainer_name ?? 'トレーナー',
    signedIn: user
      ? {
          email: isLinkOnlyEmail(user.email) ? null : user.email ?? null,
          isLinkTrainer: user.id === link.trainer_id,
          // もう本人としてログインしている（アプリはそのままホームへ）
          isSelf: !!link.trainee_id && user.id === link.trainee_id,
        }
      : null,
  })
}

// ログイン用リンクを使う（2026-10-28）。ページを開いただけ（LINE のプレビューなど）では使わず、ボタンを押した時だけ呼ぶ。
// - start: ログインしていない人。招待中ならアカウントを作って契約を始め、契約中ならその人としてログインする（cookie にセッションを入れる。アプリにはトークンを返す）
// - accept: すでにログインしている人が、そのアカウントで受け取る（今までの招待コードの入力と同じ）
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const parsed = JoinSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const forApp = parsed.data.client === 'app'

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
  const supabase = forApp ? createStatelessClient() : await createClient()
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties.hashed_token })
  if (verifyError || (forApp && !verified.session)) { await undo(); return NextResponse.json({ error: 'ログインに失敗しました。もう一度お試しください' }, { status: 500 }) }

  const { error: useError } = await service.rpc('use_trainee_login_link', { p_token: token, p_user_id: userId, p_start_date: tokyoToday() })
  if (useError) {
    await supabase.auth.signOut()
    await undo()
    return useError.hint === 'login_link_invalid' ? invalid() : trainerRpcError(useError, 'ログインに失敗しました')
  }
  if (forApp && verified.session) {
    return NextResponse.json({ ok: true, session: { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token } })
  }
  return NextResponse.json({ ok: true })
}
