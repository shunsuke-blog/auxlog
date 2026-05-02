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

  // update_session_with_sets RPC でアトミックに更新
  // SQL: lib/sql/update_session_with_sets.sql を Supabase で実行済みであること
  const { data: success, error: rpcError } = await supabase.rpc('update_session_with_sets', {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_trained_at: trained_at,
    p_fatigue_level: fatigue_level,
    p_memo: memo || null,
    p_sets: sets,
  })

  if (rpcError || !success) {
    // RPC が未設定の場合は従来の3ステップ更新にフォールバック
    const { error: sessionError } = await supabase
      .from('training_sessions')
      .update({ trained_at, fatigue_level, memo: memo || null })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (sessionError) return NextResponse.json({ error: 'セッションの更新に失敗しました' }, { status: 500 })

    await supabase.from('training_sets').delete().eq('session_id', sessionId)
    await supabase.from('training_sets').insert(
      sets.map(s => ({
        session_id: sessionId,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rir: s.rir,
        is_warmup: s.is_warmup ?? false,
      }))
    )
  }

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
