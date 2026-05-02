import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
        user_exercises(id, custom_name, exercise_master(name))
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  const { trained_at, fatigue_level, memo, sets } = body

  // セッション本体を更新
  const { error: sessionError } = await supabase
    .from('training_sessions')
    .update({ trained_at, fatigue_level, memo: memo || null })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  // セットを一括置き換え（削除→再挿入）
  const { error: deleteError } = await supabase
    .from('training_sets')
    .delete()
    .eq('session_id', sessionId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const setsToInsert = sets.map((s: {
    exercise_id: string
    set_number: number
    weight_kg: number
    reps: number
    rir: boolean
    is_warmup: boolean
  }) => ({
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

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

