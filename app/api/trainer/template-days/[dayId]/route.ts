import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const SetSchema = z.object({
  // 1RMに対する割合（0.75 = 75%）。kg指定・自動提案（両方null）と排他
  target_pct_1rm: z.number().gt(0).max(1.2).nullable(),
  target_weight_kg: z.number().min(0).max(999).nullable(),
  target_reps: z.number().int().min(1).max(100),
  target_rir: z.number().int().min(0).max(10).nullable(),
  is_warmup: z.boolean(),
}).refine(s => s.target_pct_1rm == null || s.target_weight_kg == null, '%とkgは同時に指定できません')

const ExerciseSchema = z.object({
  exercise_master_id: z.string().uuid().nullable(),
  trainer_exercise_id: z.string().uuid().nullable(),
  note: z.string().max(200).nullable(),
  sets: z.array(SetSchema).max(20),
}).refine(e => (e.exercise_master_id == null) !== (e.trainer_exercise_id == null), '種目を1つ指定してください')

const ReplaceDaySchema = z.object({ exercises: z.array(ExerciseSchema).max(30) })

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
