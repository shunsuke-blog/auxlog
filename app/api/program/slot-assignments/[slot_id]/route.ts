import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError } from '@/lib/api/errors'

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

    const { data: existingUe } = await supabase
      .from('user_exercises')
      .select('id')
      .eq('user_id', user.id)
      .eq('exercise_master_id', master.id)
      .maybeSingle()

    let exerciseId = existingUe?.id as string | undefined

    if (!exerciseId) {
      const { data: maxSortRow } = await supabase
        .from('user_exercises')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1)

      const { data: newUe, error: ueError } = await supabase
        .from('user_exercises')
        .insert({
          user_id: user.id,
          exercise_master_id: master.id,
          sort_order: (maxSortRow?.[0]?.sort_order ?? 0) + 1,
          is_compound: master.is_compound,
        })
        .select('id')
        .single()

      if (ueError || !newUe) return dbError('種目の追加に失敗しました', ueError)
      exerciseId = newUe.id
    }

    updates.exercise_id = exerciseId
  }

  const { error } = await supabase
    .from('user_slot_assignments')
    .update(updates)
    .eq('slot_id', slot_id)
    .eq('enrollment_id', enrollment_id)
    .eq('user_id', user.id)

  if (error) return dbError('スロットの更新に失敗しました', error)
  return NextResponse.json({ ok: true })
}
