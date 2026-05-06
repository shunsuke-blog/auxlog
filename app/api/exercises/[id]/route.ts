import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UpdateExerciseSchema } from '@/lib/validation/schemas'
import { validationError, dbError, notFound } from '@/lib/api/errors'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = UpdateExerciseSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const updates: Record<string, number> = {}
  if (parsed.data.default_sets !== undefined) updates.default_sets = parsed.data.default_sets
  if (parsed.data.default_reps !== undefined) updates.default_reps = parsed.data.default_reps
  if (parsed.data.weight_increment_kg !== undefined) updates.weight_increment_kg = parsed.data.weight_increment_kg
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order

  const { data, error } = await supabase
    .from('user_exercises')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return dbError('種目の更新に失敗しました', error)

  return NextResponse.json({ exercise: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // 所有権確認
  const { data: exercise } = await supabase
    .from('user_exercises')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!exercise) return notFound('種目が見つかりません')

  // 該当種目のトレーニング記録を削除してから種目を論理削除
  const { error: setsError } = await supabase
    .from('training_sets')
    .delete()
    .eq('exercise_id', id)

  if (setsError) return dbError('履歴の削除に失敗しました', setsError)

  const { error } = await supabase
    .from('user_exercises')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return dbError('種目の削除に失敗しました', error)

  return NextResponse.json({ success: true })
}
