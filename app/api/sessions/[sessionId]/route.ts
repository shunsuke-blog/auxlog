import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UpdateSessionSchema } from '@/lib/validation/schemas'
import { validationError, dbError, notFound } from '@/lib/api/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient(request)
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

  if (error || !session) return notFound('セッションが見つかりません')

  return NextResponse.json({ session })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const body = await request.json()
  const parsed = UpdateSessionSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
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

    if (sessionError) return dbError('セッションの更新に失敗しました', sessionError)

    // 削除→再作成でコーチングプランとの紐付け（plan_exercise_id）が消えないよう、種目ごとに引き継ぐ
    const { data: oldSets } = await supabase
      .from('training_sets')
      .select('exercise_id, plan_exercise_id')
      .eq('session_id', sessionId)
      .not('plan_exercise_id', 'is', null)
    const planExerciseByExercise = new Map((oldSets ?? []).map(r => [r.exercise_id as string, r.plan_exercise_id as string]))

    await supabase.from('training_sets').delete().eq('session_id', sessionId)
    const rows = sets.map(s => ({
      session_id: sessionId,
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      weight_kg: s.weight_kg,
      reps: s.reps,
      rir: s.rir,
      is_warmup: s.is_warmup ?? false,
      plan_exercise_id: planExerciseByExercise.get(s.exercise_id) ?? null,
    }))
    const { error: insertError } = await supabase.from('training_sets').insert(rows)
    // 契約・プランが終了済みだと紐付けはトリガーで拒否されるため、紐付けなしで記録だけ残す
    if (insertError && planExerciseByExercise.size > 0) {
      await supabase.from('training_sets').insert(rows.map(r => ({ ...r, plan_exercise_id: null })))
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  const { error } = await supabase
    .from('training_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return dbError('セッションの削除に失敗しました', error)

  return NextResponse.json({ success: true })
}
