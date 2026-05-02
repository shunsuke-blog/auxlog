import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UpdateSessionSchema } from '@/lib/validation/schemas'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  const { data: session, error } = await supabase
    .from('training_sessions')
    .select(`
      *,
      training_sets(
        *,
        user_exercises(id, custom_name, is_bodyweight, exercise_master(name, is_bodyweight))
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (error || !session) return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 })

  return NextResponse.json({ session })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const body = await request.json()
  const parsed = UpdateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' }, { status: 400 })
  }
  const { trained_at, fatigue_level, memo, sets } = parsed.data

  const { error: sessionError } = await supabase
    .from('training_sessions')
    .update({ trained_at, fatigue_level, memo: memo || null })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (sessionError) return NextResponse.json({ error: 'セッションの更新に失敗しました' }, { status: 500 })

  const { error: deleteError } = await supabase
    .from('training_sets')
    .delete()
    .eq('session_id', sessionId)

  if (deleteError) return NextResponse.json({ error: 'セットの更新に失敗しました' }, { status: 500 })

  const setsToInsert = sets.map(s => ({
    session_id: sessionId,
    exercise_id: s.exercise_id,
    set_number: s.set_number,
    weight_kg: s.weight_kg,
    reps: s.reps,
    rir: s.rir,
    is_warmup: s.is_warmup ?? false,
  }))

  const { error: insertError } = await supabase
    .from('training_sets')
    .insert(setsToInsert)

  if (insertError) return NextResponse.json({ error: 'セットの保存に失敗しました' }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  const { error } = await supabase
    .from('training_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'セッションの削除に失敗しました' }, { status: 500 })

  return NextResponse.json({ success: true })
}
