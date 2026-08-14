import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'
import { todayInJST, jstDateStr } from '@/lib/utils/date'

export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week, started_at, current_week_started_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (enrollmentError) return dbError('プログラム状況の取得に失敗しました', enrollmentError)
  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // 現在の週の開始日を計算（暦週固定グリッド。9週間ピリオダイゼーションの前提を崩さないため、
  // advance-weekで早送りしても実日数が経過するまではここを動かさない設計）
  const weekStart = new Date(enrollment.started_at)
  weekStart.setDate(weekStart.getDate() + (enrollment.current_week - 1) * 7)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  // 前週の開始日（オーバーワーク警告の対象記録を絞り込む下限。early_exercise_idsは
  // 「早送り後、本来のweekStartに到達する前に記録された分」だけを指すため、
  // 2週分以上前の記録を誤って含めないようにこの範囲で区切る）
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0]

  const isBeforeWeekStart = todayInJST() < weekStart

  // 今週の達成判定の実際の下限。weekStartStr（暦週固定グリッド）だけだと、週の完了が遅れた場合に
  // 「まだ進む前に記録した過去ログ」が次週の判定にそのまま流用されてしまう
  // （[[project_auxlog_week_advance_no_day_gate]]）。実際に進んだ時刻(current_week_started_at)の方が
  // 遅ければそちらを下限として優先する。早送り・オンスケジュールのケースでは
  // current_week_started_at <= weekStart なので、常にweekStartStrが使われ挙動は変わらない
  const advancedAtStr = jstDateStr(new Date(enrollment.current_week_started_at))
  const effectiveWeekStartStr = advancedAtStr > weekStartStr ? advancedAtStr : weekStartStr

  // 今週のセッションID・前週の早送り記録セッションID・全スロット割り当て（全Day）は
  // 互いに依存しないため並列取得（2026-07-10、ホーム画面の体感速度改善でラウンドトリップを1回減らす）
  const [
    { data: sessions, error: sessionsError },
    { data: earlySessions, error: earlySessionsError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .gte('trained_at', effectiveWeekStartStr),
    supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_early', true)
      .gte('trained_at', prevWeekStartStr)
      .lt('trained_at', weekStartStr),
    supabase
      .from('user_slot_assignments')
      .select('exercise_id')
      .eq('enrollment_id', enrollment.id)
      .eq('is_hidden', false),
  ])

  if (sessionsError) return dbError('今週のセッション取得に失敗しました', sessionsError)
  if (earlySessionsError) return dbError('早送り記録の取得に失敗しました', earlySessionsError)
  if (assignmentsError) return dbError('種目割り当ての取得に失敗しました', assignmentsError)

  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)
  const earlySessionIds = (earlySessions ?? []).map((s: { id: string }) => s.id)

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

  // 早送り後、本来のweekStartに到達する前に記録された（=今週の達成にはカウントされない）exercise_id を取得
  let earlyExerciseIds: string[] = []
  if (earlySessionIds.length > 0) {
    const { data: earlySets, error: earlySetsError } = await supabase
      .from('training_sets')
      .select('exercise_id')
      .in('session_id', earlySessionIds)
      .eq('is_warmup', false)

    if (earlySetsError) return dbError('早送り記録のセット取得に失敗しました', earlySetsError)

    earlyExerciseIds = [...new Set((earlySets ?? []).map((s: { exercise_id: string }) => s.exercise_id))]
  }

  const allExerciseIds = (assignments ?? []).map((a: { exercise_id: string }) => a.exercise_id)
  const completedSet = new Set(completedExerciseIds)
  const all_complete = allExerciseIds.length > 0 && allExerciseIds.every(id => completedSet.has(id))

  return NextResponse.json({
    completed_exercise_ids: completedExerciseIds,
    all_complete,
    is_before_week_start: isBeforeWeekStart,
    early_exercise_ids: earlyExerciseIds,
  })
}
