import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const RedeemSchema = z.object({ code: z.string().trim().min(4).max(16) })

// 招待コードの入力（トレーニー側）。契約が始まり、セルフモードのプログラムは終了する。
// 入力画面はコーチングモード（トレーニーがプランに沿って記録する画面）と一緒に追加する。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RedeemSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('redeem_trainer_invite', { p_code: parsed.data.code })
  if (error) return trainerRpcError(error, '招待コードの入力に失敗しました')
  return NextResponse.json({ link_id: data })
}
