import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week, started_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // 現在の週の開始日を計算
  const weekStart = new Date(enrollment.started_at)
  weekStart.setDate(weekStart.getDate() + (enrollment.current_week - 1) * 7)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  // 今週のセッションIDを取得
  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', user.id)
    .gte('trained_at', weekStartStr)

  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)

  // 今週記録した exercise_id を取得
  let completedExerciseIds: string[] = []
  if (sessionIds.length > 0) {
    const { data: sets } = await supabase
      .from('training_sets')
      .select('exercise_id')
      .in('session_id', sessionIds)
      .eq('is_warmup', false)

    completedExerciseIds = [...new Set((sets ?? []).map((s: { exercise_id: string }) => s.exercise_id))]
  }

  // 全スロット割り当て（全Day）を取得
  const { data: assignments } = await supabase
    .from('user_slot_assignments')
    .select('exercise_id')
    .eq('enrollment_id', enrollment.id)

  const allExerciseIds = (assignments ?? []).map((a: { exercise_id: string }) => a.exercise_id)
  const completedSet = new Set(completedExerciseIds)
  const all_complete = allExerciseIds.length > 0 && allExerciseIds.every(id => completedSet.has(id))

  return NextResponse.json({ completed_exercise_ids: completedExerciseIds, all_complete })
}
