import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { MAX_IMPORT_DAYS, MAX_IMPORT_WEEKS } from '@/lib/trainer/menuImport'
import { TemplateExerciseSchema } from '@/lib/trainer/templateDaySchema'

const ImportTemplateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  total_weeks: z.number().int().min(1).max(MAX_IMPORT_WEEKS),
  days_per_week: z.number().int().min(1).max(MAX_IMPORT_DAYS),
  days: z.array(z.object({
    week: z.number().int().min(1).max(MAX_IMPORT_WEEKS),
    day: z.number().int().min(1).max(MAX_IMPORT_DAYS),
    label: z.string().max(30).nullable(),
    // テンプレートの1日分の保存と同じ形
    exercises: z.array(TemplateExerciseSchema).max(30),
  })).max(MAX_IMPORT_WEEKS * MAX_IMPORT_DAYS),
})

// 取り込んだメニュー（下書き）からテンプレートを作る（2026-10-28）。下書きの編集画面で「保存」を押した時だけ呼ぶ
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ImportTemplateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('create_imported_template', {
    p_name: parsed.data.name,
    p_total_weeks: parsed.data.total_weeks,
    p_days_per_week: parsed.data.days_per_week,
    p_days: parsed.data.days,
  })
  if (error) return trainerRpcError(error, 'テンプレートの作成に失敗しました')
  return NextResponse.json({ id: data })
}
