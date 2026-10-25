import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { RULE_MESSAGES, trainerRpcError } from '@/lib/trainer/rpc'

const RedeemSchema = z.object({
  code: z.string().trim().min(4).max(16),
  // プランを始める日（過去の日付も可）。省略時は今日（2026-10-25）
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// 招待コードの入力（トレーニー側）。契約が始まり、セルフモードのプログラムは終了する。
// 入力画面はコーチングモード（トレーニーがプランに沿って記録する画面）と一緒に追加する。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RedeemSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('redeem_trainer_invite', { p_code: parsed.data.code, p_start_date: parsed.data.start_date ?? null })
  if (error) return trainerRpcError(error, '招待コードの入力に失敗しました')
  // コードが無効な時、DB は間違えた回数を残すため例外ではなく null を返す（15分に10回まで、L4）
  if (!data) return NextResponse.json({ error: RULE_MESSAGES.invalid_code, reason: 'invalid_code' }, { status: 409 })
  return NextResponse.json({ link_id: data })
}
