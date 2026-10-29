import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { estimateOneRmFromSets } from '@/lib/coaching/one_rm'

// トレーナーがクライアントの記録を直す・代わりに入力する（2026-10-29）。契約中の担当トレーナーとチームの管理者だけ、
// 契約の開始日以降の記録だけ（DB の can_trainer_edit）。書き込みは RPC だけで、記録には入力したトレーナーが残る。

const SetSchema = z.object({
  // クライアントの種目。代理入力で初めての種目は無く、plan_exercise_id から DB で用意する
  exercise_id: z.string().uuid().nullable(),
  plan_exercise_id: z.string().uuid().nullable(),
  set_number: z.number().int().min(1).max(50),
  weight_kg: z.number().min(0).max(500),
  reps: z.number().int().min(0).max(200),
  rir: z.boolean(),
  is_warmup: z.boolean(),
  duration_seconds: z.number().int().min(1).max(86400).nullable(),
  distance_km: z.number().gt(0).max(1000).nullable(),
  calories_kcal: z.number().int().min(1).max(20000).nullable(),
}).refine(s => s.exercise_id != null || s.plan_exercise_id != null, { message: '種目がありません' })

const SaveSchema = z.object({
  trainee_id: z.string().uuid(),
  trained_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sets: z.array(SetSchema).min(1).max(50),
})

// 記録を保存する（無ければ作る、あればセットを置き換える）。ID は画面で作るので、同じ内容の再送は同じ結果になる
export async function PUT(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const { sessionId } = await params
  if (!z.string().uuid().safeParse(sessionId).success) return NextResponse.json({ error: '記録が見つかりません' }, { status: 404 })
  const { trainee_id, trained_at, sets } = parsed.data

  const { error } = await supabase.rpc('trainer_save_client_session', {
    p_trainee: trainee_id,
    p_session_id: sessionId,
    p_trained_at: trained_at,
    p_sets: sets,
  })
  if (error) return trainerRpcError(error, '保存に失敗しました')

  // 1RM を入れずに共有された種目は、初回の記録から次回以降の %1RM のセットに重量を入れる（クライアントの保存と同じ。
  // 重量が空のセットだけ・何回呼んでも同じ）。失敗しても記録の保存は成功扱い
  const planExerciseIds = [...new Set(sets.map(s => s.plan_exercise_id).filter((id): id is string => !!id))]
  for (const id of planExerciseIds) {
    const oneRm = estimateOneRmFromSets(sets.filter(s => s.plan_exercise_id === id))
    if (oneRm == null) continue
    const { error: fillError } = await supabase.rpc('fill_plan_weights', { p_plan_exercise_id: id, p_one_rm_kg: oneRm })
    if (fillError) console.error('[fill_plan_weights]', fillError.message)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  if (!z.string().uuid().safeParse(sessionId).success) return NextResponse.json({ ok: true })
  const { error } = await supabase.rpc('trainer_delete_client_session', { p_session_id: sessionId })
  if (error) return trainerRpcError(error, '削除に失敗しました')
  return NextResponse.json({ ok: true })
}
