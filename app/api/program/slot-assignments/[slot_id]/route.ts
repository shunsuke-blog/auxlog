import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError, notFound } from '@/lib/api/errors'
import { VALID_SLOT_IDS } from '@/lib/constants/program_slots'
import { findOrCreateUserExercise } from '@/lib/program/find_or_create_user_exercise'

const PatchSchema = z.object({
  enrollment_id: z.string().min(1),
  is_hidden: z.boolean().optional(),
  exercise_name: z.string().min(1).max(100).optional(),
}).refine(data => data.is_hidden !== undefined || data.exercise_name !== undefined, {
  message: 'is_hidden か exercise_name のいずれかが必要です',
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slot_id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slot_id } = await params
  if (!VALID_SLOT_IDS.has(slot_id)) {
    return NextResponse.json({ error: '不正なスロットIDです' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const { enrollment_id, is_hidden, exercise_name } = parsed.data

  const updates: Record<string, unknown> = {}
  if (is_hidden !== undefined) updates.is_hidden = is_hidden

  if (exercise_name !== undefined) {
    // このスロットで選択可能な種目かどうかを exercise_master.slot_type で検証
    const { data: master, error: masterError } = await supabase
      .from('exercise_master')
      .select('id, is_compound')
      .eq('name', exercise_name)
      .eq('slot_type', slot_id)
      .maybeSingle()

    if (masterError) return dbError('種目の確認に失敗しました', masterError)
    if (!master) return NextResponse.json({ error: 'このスロットでは選択できない種目です' }, { status: 400 })

    const result = await findOrCreateUserExercise(supabase, user.id, master.id, master.is_compound)
    if (result.error) return dbError(result.error)

    updates.exercise_id = result.id
  }

  const { data, error } = await supabase
    .from('user_slot_assignments')
    .update(updates)
    .eq('slot_id', slot_id)
    .eq('enrollment_id', enrollment_id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return dbError('スロットの更新に失敗しました', error)
  if (!data || data.length === 0) return notFound('対象のスロット割り当てが見つかりません')

  return NextResponse.json({ ok: true })
}
