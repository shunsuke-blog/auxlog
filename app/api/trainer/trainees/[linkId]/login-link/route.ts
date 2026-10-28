import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// クライアントのログイン用リンクを作る・作り直す（2026-10-28。招待コードの再発行の代わり）。
// 招待中は期限切れ・紛失の時、契約中・一時停止は機種変更などでもう一度ログインする時。前のリンクは使えなくなる
export async function POST(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkId } = await params
  const { data, error } = await supabase.rpc('issue_trainee_login_link', { p_link_id: linkId })
  if (error) return trainerRpcError(error, 'リンクの作成に失敗しました')
  return NextResponse.json(data)
}
