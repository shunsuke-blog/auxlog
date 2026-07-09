import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week, started_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (enrollmentError) return dbError('プログラム状況の取得に失敗しました', enrollmentError)
  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // 現在の週の開始日を計算
  const weekStart = new Date(enrollment.started_at)
  weekStart.setDate(weekStart.getDate() + (enrollment.current_week - 1) * 7)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  // 今週のセッションIDを取得
  const { data: sessions, error: sessionsError } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', user.id)
    .gte('trained_at', weekStartStr)

  if (sessionsError) return dbError('今週のセッション取得に失敗しました', sessionsError)

  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)

  // 今週記録した exercise_id を取得
  let completedExerciseIds: string[] = []
  if (sessionIds.length > 0) {
    const { data: sets, error: setsError } = await supabase
      .from('training_sets')
      .select('exercise_id')
      .in('session_id', sessionIds)
      .eq('is_warmup', false)

    if (setsError) return dbError('セット記録の取得に失敗しました', setsError)

    completedExerciseIds = [...new Set((sets ?? []).map((s: { exercise_id: string }) => s.exercise_id))]
  }

  // 全スロット割り当て（全Day）を取得
  const { data: assignments, error: assignmentsError } = await supabase
    .from('user_slot_assignments')
    .select('exercise_id')
    .eq('enrollment_id', enrollment.id)
    .eq('is_hidden', false)

  if (assignmentsError) return dbError('種目割り当ての取得に失敗しました', assignmentsError)

  const allExerciseIds = (assignments ?? []).map((a: { exercise_id: string }) => a.exercise_id)
  const completedSet = new Set(completedExerciseIds)
  const all_complete = allExerciseIds.length > 0 && allExerciseIds.every(id => completedSet.has(id))

  return NextResponse.json({ completed_exercise_ids: completedExerciseIds, all_complete })
}
