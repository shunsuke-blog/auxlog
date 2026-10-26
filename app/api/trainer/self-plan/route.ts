import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const OneRmSchema = z.object({
  exercise_master_id: z.string().uuid().nullable(),
  trainer_exercise_id: z.string().uuid().nullable(),
  one_rm_kg: z.number().gt(0).max(500),
})

const AssignSchema = z.object({
  template_id: z.string().uuid(),
  one_rms: z.array(OneRmSchema).max(30),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// トレーナーが自分自身にプログラムを割り当てる（2026-10-26）。今のプランは終了し、テンプレートを複製して始める。
// 割り当て中は自分のトレーニー画面がコーチングモードになる。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = AssignSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('assign_self_plan', {
    p_template_id: parsed.data.template_id,
    p_one_rms: parsed.data.one_rms,
    p_start_date: parsed.data.start_date,
  })
  if (error) return trainerRpcError(error, 'プログラムの割り当てに失敗しました')
  return NextResponse.json({ plan_id: data })
}

// 自分のプランを終了する（セルフモードに戻る）
export async function DELETE(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.rpc('end_self_plan')
  if (error) return trainerRpcError(error, 'プログラムの終了に失敗しました')
  return NextResponse.json({ ok: true })
}
