import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { trainerRpcError } from '@/lib/trainer/rpc'

// 記録の保存前: プランの種目に対応するトレーニーの種目（user_exercises）を用意してIDを返す。
// 初めて記録する種目はトレーニーの種目一覧にコピーされる（契約終了後も種目名が残る）。
export async function POST(request: Request, { params }: { params: Promise<{ planExerciseId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planExerciseId } = await params
  const { data, error } = await supabase.rpc('ensure_plan_user_exercise', { p_plan_exercise_id: planExerciseId })
  if (error) return trainerRpcError(error, '種目の準備に失敗しました')
  return NextResponse.json({ user_exercise_id: data })
}
