import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// 種目を飛ばす（POST）/ 飛ばしたのを取り消す（DELETE）。記録済みの種目は飛ばせない。
async function handle(request: Request, params: Promise<{ planExerciseId: string }>, fn: 'skip_plan_exercise' | 'unskip_plan_exercise') {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planExerciseId } = await params
  const { error } = await supabase.rpc(fn, { p_plan_exercise_id: planExerciseId })
  if (error) return trainerRpcError(error, fn === 'skip_plan_exercise' ? 'スキップに失敗しました' : 'スキップの取り消しに失敗しました')
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request, { params }: { params: Promise<{ planExerciseId: string }> }) {
  return handle(request, params, 'skip_plan_exercise')
}

export async function DELETE(request: Request, { params }: { params: Promise<{ planExerciseId: string }> }) {
  return handle(request, params, 'unskip_plan_exercise')
}
