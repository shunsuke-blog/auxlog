import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UpdateExerciseSchema } from '@/lib/validation/schemas'

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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' }, { status: 400 })
  }

  const updates: Record<string, number> = {}
  if (parsed.data.default_sets !== undefined) updates.default_sets = parsed.data.default_sets
  if (parsed.data.default_reps !== undefined) updates.default_reps = parsed.data.default_reps
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order

  const { data, error } = await supabase
    .from('user_exercises')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '種目の更新に失敗しました' }, { status: 500 })

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

  const { error } = await supabase
    .from('user_exercises')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: '種目の削除に失敗しました' }, { status: 500 })

  return NextResponse.json({ success: true })
}
