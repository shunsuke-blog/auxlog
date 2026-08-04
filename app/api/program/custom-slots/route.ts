import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError, dbError } from '@/lib/api/errors'

const PostSchema = z.object({
  exercise_id: z.string().min(1),
  day_number: z.number().int().min(1).max(4),
  muscle_group: z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']),
})

// コーチングタブ「種目情報」から追加するカスタムスロット。24カテゴリのprogram_slotsとは
// 別に、rep_range_min/maxだけを持たせてprogram_engine.tsのアイソレーション計算経路
// （週次DBパラメータ不要）に乗せる（2026-08-03）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = PostSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const { exercise_id, day_number, muscle_group } = parsed.data

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // exercise_idが自分自身のuser_exercisesであることを確認する（day-extras/route.tsと同じ理由:
  // FK制約は存在確認のみで所有権までは保証しないため）
  const { data: ownedExercise } = await supabase
    .from('user_exercises')
    .select('id')
    .eq('id', exercise_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!ownedExercise) return NextResponse.json({ error: 'この種目は使用できません' }, { status: 403 })

  const { error } = await supabase
    .from('user_custom_slots')
    .insert({ user_id: user.id, enrollment_id: enrollment.id, exercise_id, day_number, muscle_group })

  if (error) return dbError('種目の追加に失敗しました', error)
  return NextResponse.json({ ok: true })
}
