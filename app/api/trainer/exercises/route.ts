import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const CreateTrainerExerciseSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // 'cardio' は有酸素運動（2026-10-26）。プログラムではセットの代わりに目標の時間・距離を持つ
  target_muscle: z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio']),
  is_compound: z.boolean(),
  is_bodyweight: z.boolean(),
})

// exercise_master に無いトレーナー独自の種目を作る。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = CreateTrainerExerciseSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc('create_trainer_exercise', {
    p_name: parsed.data.name,
    p_target_muscle: parsed.data.target_muscle,
    p_is_compound: parsed.data.is_compound,
    p_is_bodyweight: parsed.data.is_bodyweight,
  })
  if (error) return trainerRpcError(error, '種目の作成に失敗しました')
  return NextResponse.json({ id: data })
}
