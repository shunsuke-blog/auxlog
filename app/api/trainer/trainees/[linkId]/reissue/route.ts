import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// 招待コードの再発行（期限切れ・紛失時）。古いコードは無効になる。
export async function POST(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkId } = await params
  const { data, error } = await supabase.rpc('reissue_trainee_invite', { p_link_id: linkId })
  if (error) return trainerRpcError(error, '招待コードの再発行に失敗しました')
  return NextResponse.json(data)
}
