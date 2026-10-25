import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

// 進める元の週（画面に表示していた週）。二重送信や再送で2週進まないよう、DB はこの週の時だけ進める（2026-10-25 レビュー対応 M1）
const AdvanceSchema = z.object({ from_week: z.number().int().min(1).max(16) })

// コーチングプランを次の週へ進める（セルフモードの advance-week と同じく、トレーニーが進める）
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = AdvanceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('advance_coaching_week', { p_from_week: parsed.data.from_week })
  if (error) return trainerRpcError(error, '週の更新に失敗しました')
  return NextResponse.json({ current_week: data })
}
