import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { TemplateExerciseSchema } from '@/lib/trainer/templateDaySchema'

const ReplaceDaySchema = z.object({ exercises: z.array(TemplateExerciseSchema).max(30) })

// テンプレートの1日分（種目・セット）を丸ごと保存する。replace_template_day RPC が1トランザクションで入れ替える。
export async function PUT(request: Request, { params }: { params: Promise<{ dayId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ReplaceDaySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { dayId } = await params
  const { error } = await supabase.rpc('replace_template_day', { p_plan_day_id: dayId, p_exercises: parsed.data.exercises })
  if (error) return trainerRpcError(error, '保存に失敗しました')
  return NextResponse.json({ ok: true })
}
