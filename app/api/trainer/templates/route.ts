import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  total_weeks: z.number().int().min(1).max(16),
  days_per_week: z.number().int().min(1).max(7),
})

// テンプレートを白紙から作成する（週数×週の日数ぶんの空のDayを作る）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = CreateTemplateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('create_plan_template', {
    p_name: parsed.data.name,
    p_total_weeks: parsed.data.total_weeks,
    p_days_per_week: parsed.data.days_per_week,
  })
  if (error) return trainerRpcError(error, 'テンプレートの作成に失敗しました')
  return NextResponse.json({ id: data })
}
