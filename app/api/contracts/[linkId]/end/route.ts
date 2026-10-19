import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// 契約の終了（トレーナー・トレーニーのどちらからでも）。招待中の場合は取り消し。
export async function POST(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkId } = await params
  const { error } = await supabase.rpc('end_trainer_contract', { p_link_id: linkId })
  if (error) return trainerRpcError(error, '契約の終了に失敗しました')
  return NextResponse.json({ ok: true })
}
