import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'
import { createSelfEnrollment } from '@/lib/program/create_self_enrollment'
import { VALID_CATEGORY_IDS } from '@/lib/constants/program_composition'
import { z } from 'zod'
import { getTraineeLink } from '@/lib/coaching/trainee'

// priority_muscles: program_composition.tsのPriorityMuscleOption（二頭・三頭を別選択肢化、2026-07-08）
const PRIORITY_MUSCLE_ENUM = z.enum(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'])

const EnrollSchema = z.object({
  days_per_week: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  session_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]),
  // 種目選定・ボリューム漸進の両方に使う優先部位（program_composition.ts）。
  // 空配列 = 未選択（全身くまなく）。フォールバックは廃止済み（2026-07-08）。
  priority_muscles: z.array(PRIORITY_MUSCLE_ENUM).max(2).default([]),
  slot_assignments: z.array(z.object({
    slot_id: z.string().refine(id => VALID_CATEGORY_IDS.has(id), { message: '不正なスロットIDです' }),
    exercise_name: z.string().min(1).max(100),
  })).min(1),
  one_rms: z.array(z.object({
    slot_id: z.string().refine(id => VALID_CATEGORY_IDS.has(id), { message: '不正なスロットIDです' }),
    one_rm_kg: z.number().positive().max(1000),
    source: z.enum(['manual_input', 'epley_estimated']),
  })),
})

export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // 同時に進められるプログラムは1つ。トレーナーと契約中はトレーナーのプランを使う
  if (await getTraineeLink(supabase, user.id)) {
    return NextResponse.json({ error: 'トレーナーのプランを利用中のため、プログラムは作成できません' }, { status: 409 })
  }

  const parsed = EnrollSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' }, { status: 400 })
  }
  const { days_per_week, session_duration_minutes, priority_muscles, slot_assignments, one_rms } = parsed.data

  const result = await createSelfEnrollment(supabase, user.id, { days_per_week, session_duration_minutes, priority_muscles, slot_assignments, one_rms })
  if ('error' in result) {
    if (result.status === 500) return dbError(result.error, result.cause)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ enrollment_id: result.enrollmentId })
}
