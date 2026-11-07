import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { appJoinUrl } from '@/lib/trainer/loginLink'

// ブラウザで使っているクライアントがアプリに移る（2026-11-07）。自分用の使い捨てのログイン用リンク（10分）を作り、
// アプリで開く URL を返す。DB は lib/sql/trainee_app_handoff_link_2026-11-07.sql
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.rpc('issue_own_app_login_link')
  if (error) {
    if (error.hint === 'login_link_invalid') return NextResponse.json({ error: 'トレーナーとの契約が無いため、アプリ用のリンクを作れません', reason: 'login_link_invalid' }, { status: 409 })
    return trainerRpcError(error, 'アプリ用のリンクを作れませんでした')
  }
  return NextResponse.json({ url: appJoinUrl(data as string) })
}
