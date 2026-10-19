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

const AddTraineeSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
  template_id: z.string().uuid(),
  one_rms: z.array(OneRmSchema).max(30),
})

// トレーニーの追加: テンプレートを選んで複製し（1RMから kg を計算）、招待コードを発行する。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = AddTraineeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('add_trainee_with_plan', {
    p_display_name: parsed.data.display_name,
    p_template_id: parsed.data.template_id,
    p_one_rms: parsed.data.one_rms,
  })
  if (error) return trainerRpcError(error, 'トレーニーの追加に失敗しました')
  return NextResponse.json(data)
}
