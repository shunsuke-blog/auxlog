import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// コーチングプランを完了する（最終週の後、成長レポートを見てから）。契約は続き、
// トレーナーが次のプランを共有するまでホームは「次のプランを準備中」になる。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.rpc('finish_coaching_plan')
  if (error) return trainerRpcError(error, 'プランの完了に失敗しました')
  return NextResponse.json({ ok: true })
}
