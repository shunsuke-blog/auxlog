import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { TemplateExerciseSchema } from '@/lib/trainer/templateDaySchema'

// 変えない種目は ID を送る（ID を残して更新する）。新しく足した・入れ替えた種目は ID なし
const ClientPlanExerciseSchema = TemplateExerciseSchema.and(z.object({ plan_exercise_id: z.string().uuid().nullable().optional() }))
const SaveSchema = z.object({
  days: z.array(z.object({ plan_day_id: z.string().uuid(), exercises: z.array(ClientPlanExerciseSchema).max(30) })).min(1).max(100),
})

// 契約中のクライアントのプランを途中で変える（2026-11-09）。変えた Day をまとめて1回で保存する（「保存する」を押した時だけ）。
// DB は lib/sql/client_plan_edit_2026-11-09.sql（今の週から後だけ、記録・スキップした種目は残す）
export async function PUT(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { planId } = await params
  const { error } = await supabase.rpc('replace_client_plan_days', { p_plan_id: planId, p_days: parsed.data.days })
  if (error) return trainerRpcError(error, '保存に失敗しました')
  return NextResponse.json({ ok: true })
}
