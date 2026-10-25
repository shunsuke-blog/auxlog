import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveTraineeHome } from '@/lib/coaching/trainee_home'

// アプリのホーム・タブの出し分け（コーチングモード／次のプラン待ち／セルフモード／オンボーディング）。
// Web のホームと同じ判定（lib/coaching/trainee_home.ts）。コーチングモードなら今週のメニューも返す
export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await resolveTraineeHome(supabase, user.id))
}
