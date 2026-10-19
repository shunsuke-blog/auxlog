import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// コーチングプランを次の週へ進める（セルフモードの advance-week と同じく、トレーニーが進める）
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('advance_coaching_week')
  if (error) return trainerRpcError(error, '週の更新に失敗しました')
  return NextResponse.json({ current_week: data })
}
