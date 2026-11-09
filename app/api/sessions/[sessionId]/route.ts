import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UpdateSessionSchema } from '@/lib/validation/schemas'
import { validationError, dbError, notFound } from '@/lib/api/errors'
import { recomputeExerciseBests } from '@/lib/record/exercise_bests'

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

  // 編集前の種目（編集で外した種目の自己ベストも計算し直すため）
  const { data: beforeSets } = await supabase.from('training_sets').select('exercise_id, training_sessions!inner(user_id)').eq('session_id', sessionId).eq('training_sessions.user_id', user.id)
  const touchedExerciseIds = [...(beforeSets ?? []).map(r => r.exercise_id as string), ...sets.map(s => s.exercise_id)]
  // 編集前の日付（コーチングプランとの紐付けを同じ日の記録から引き継ぐため。下で日付を書き換える前に読む）
  const { data: before } = await supabase.from('training_sessions').select('trained_at').eq('id', sessionId).eq('user_id', user.id).maybeSingle()

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

    // 削除→再作成でコーチングプランとの紐付け（plan_exercise_id）が消えないよう、種目ごとに引き継ぐ。
    // 同じ日の自分の記録すべてから引き継ぐ: 履歴の日付の鉛筆から直すと、同じ日の記録をこの記録にまとめて保存してから
    // 残りを消すので、この記録の分だけだと、まとめた側の種目の紐付けが消えて「プラン外」になっていた（2026-11-09 修正）。
    // 同じ種目が同じ日に2つあれば、この記録の紐付けを優先する
    const { data: oldSets } = await supabase
      .from('training_sets')
      .select('session_id, exercise_id, plan_exercise_id, training_sessions!inner(user_id, trained_at)')
      .eq('training_sessions.user_id', user.id)
      .eq('training_sessions.trained_at', before?.trained_at ?? trained_at)
      .not('plan_exercise_id', 'is', null)
    const ordered = [...(oldSets ?? [])].sort((a, b) => Number(a.session_id === sessionId) - Number(b.session_id === sessionId))
    const planExerciseByExercise = new Map(ordered.map(r => [r.exercise_id as string, r.plan_exercise_id as string]))

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
      duration_seconds: s.duration_seconds ?? null,
      distance_km: s.distance_km ?? null,
      calories_kcal: s.calories_kcal ?? null,
    }))
    const { error: insertError } = await supabase.from('training_sets').insert(rows)
    // 契約・プランが終了済みだと紐付けはトリガーで拒否されるため、紐付けなしで記録だけ残す
    if (insertError && planExerciseByExercise.size > 0) {
      await supabase.from('training_sets').insert(rows.map(r => ({ ...r, plan_exercise_id: null })))
    }
  }

  // 編集で重量・回数が下がったり種目を外したりしても自己ベストが残らないよう、残っている記録から計算し直す
  await recomputeExerciseBests(supabase, user.id, touchedExerciseIds)

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

  // 削除する記録の種目（削除後に自己ベストを計算し直す）
  const { data: deletedSets } = await supabase.from('training_sets').select('exercise_id, training_sessions!inner(user_id)').eq('session_id', sessionId).eq('training_sessions.user_id', user.id)

  const { error } = await supabase
    .from('training_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return dbError('セッションの削除に失敗しました', error)

  // 消した記録の値が自己ベストに残らないよう、残っている記録から計算し直す（2026-10-25 不具合修正）
  await recomputeExerciseBests(supabase, user.id, (deletedSets ?? []).map(r => r.exercise_id as string))

  return NextResponse.json({ success: true })
}
