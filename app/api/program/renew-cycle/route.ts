import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError, notFound } from '@/lib/api/errors'
import { estimateOneRm } from '@/lib/utils/epley'

const todayJST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

type AssignmentRow = {
  slot_id: string
  exercise_id: string
  is_hidden: boolean
  user_exercises: { exercise_master: { movement_pattern: string | null } | null } | null
}

// Week9(MaxOut)完了後、実績（トップセット=AMRAP対象種目の重量×回数）から1RMを自動推定し、
// 種目の選び直しをさせずに次の9週間プログラムを開始する。
// 手動リセット（api/program/reset）と異なり、旧enrollmentは削除せずis_active=falseに
// するだけなのでトレーニング履歴は失われない。1RMも新しい行をinsertするだけで良い
// （user_slot_one_rmsはenrollment_idを持たず、recorded_at最新の行が常に採用される設計）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('user_program_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (enrollmentError) return dbError('プログラム状況の取得に失敗しました', enrollmentError)
  if (!enrollment) return notFound('アクティブなプログラムがありません')
  if (enrollment.current_week !== 9) {
    return NextResponse.json({ error: 'Week9（最終週）完了後のみ次のプログラムを開始できます' }, { status: 400 })
  }

  // Week9の開始日を計算（api/suggest/program/week-status と同じロジック）
  const weekStart = new Date(enrollment.started_at)
  weekStart.setDate(weekStart.getDate() + (enrollment.current_week - 1) * 7)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  const { data: assignments, error: assignmentsError } = await supabase
    .from('user_slot_assignments')
    .select('slot_id, exercise_id, is_hidden, user_exercises(exercise_master(movement_pattern))')
    .eq('enrollment_id', enrollment.id)
    .returns<AssignmentRow[]>()

  if (assignmentsError) return dbError('種目割り当ての取得に失敗しました', assignmentsError)
  if (!assignments || assignments.length === 0) return dbError('種目割り当てが見つかりませんでした')

  // Week9が「全種目記録済み」であることをサーバー側で再検証（クライアントの申告を信用しない）
  const { data: sessions, error: sessionsError } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', user.id)
    .gte('trained_at', weekStartStr)

  if (sessionsError) return dbError('今週のセッション取得に失敗しました', sessionsError)
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)

  let completedExerciseIds: string[] = []
  const topSetsByExercise = new Map<string, { weight_kg: number; reps: number }[]>()
  if (sessionIds.length > 0) {
    const { data: sets, error: setsError } = await supabase
      .from('training_sets')
      .select('exercise_id, set_number, weight_kg, reps')
      .in('session_id', sessionIds)
      .eq('is_warmup', false)

    if (setsError) return dbError('セット記録の取得に失敗しました', setsError)

    completedExerciseIds = [...new Set((sets ?? []).map((s: { exercise_id: string }) => s.exercise_id))]

    // set_number=1 がトップセット（AMRAP対象種目の全力セット）という前提
    // （program_engine.tsのbuildCompoundSetsは常にtop setを配列先頭=set_number 1として生成）。
    for (const s of sets ?? []) {
      if (s.set_number !== 1) continue
      const list = topSetsByExercise.get(s.exercise_id) ?? []
      list.push({ weight_kg: s.weight_kg, reps: s.reps })
      topSetsByExercise.set(s.exercise_id, list)
    }
  }

  const nonHiddenExerciseIds = assignments.filter(a => !a.is_hidden).map(a => a.exercise_id)
  const completedSet = new Set(completedExerciseIds)
  const allComplete = nonHiddenExerciseIds.length > 0 && nonHiddenExerciseIds.every(id => completedSet.has(id))

  if (!allComplete) {
    return NextResponse.json({ error: 'Week9の全種目がまだ記録されていません' }, { status: 400 })
  }

  // AMRAP対象（top_set_is_amrap=true）のmovement_patternをWeek9パラメータから特定
  const { data: week9Params, error: paramsError } = await supabase
    .from('movement_pattern_weekly_params')
    .select('movement_pattern, top_set_is_amrap')
    .eq('program_id', enrollment.program_id)
    .eq('week_number', 9)

  if (paramsError) return dbError('週次パラメータの取得に失敗しました', paramsError)
  const amrapPatterns = new Set(
    (week9Params ?? []).filter((p: { top_set_is_amrap: boolean }) => p.top_set_is_amrap)
      .map((p: { movement_pattern: string }) => p.movement_pattern)
  )

  // AMRAP対象スロットのみ、Week9のトップセット実績からEpley推定で新1RMを算出。
  // 対象外（アイソレーション種目等）は何もしない＝既存の1RMがそのまま「最新」として使われ続ける。
  const newOneRms: { slot_id: string; one_rm_kg: number }[] = []
  for (const a of assignments) {
    const movementPattern = a.user_exercises?.exercise_master?.movement_pattern
    if (!movementPattern || !amrapPatterns.has(movementPattern)) continue

    const topSets = topSetsByExercise.get(a.exercise_id)
    if (!topSets || topSets.length === 0) continue

    // 同じ種目を週内に複数回記録している場合は最も良い推定値を採用
    const best = topSets.reduce((max, s) => Math.max(max, estimateOneRm(s.weight_kg, s.reps)), 0)
    if (best > 0) newOneRms.push({ slot_id: a.slot_id, one_rm_kg: best })
  }

  // 旧enrollmentを終了（削除しないためトレーニング履歴・実績は残る）
  const { error: deactivateError } = await supabase
    .from('user_program_enrollments')
    .update({ is_active: false, completed_at: todayJST() })
    .eq('id', enrollment.id)

  if (deactivateError) return dbError('プログラムの終了処理に失敗しました', deactivateError)

  // 新enrollment作成。設定(days_per_week等)はそのまま引き継ぎ、Week1から再スタート
  const { data: newEnrollment, error: newEnrollError } = await supabase
    .from('user_program_enrollments')
    .insert({
      user_id: user.id,
      program_id: enrollment.program_id,
      days_per_week: enrollment.days_per_week,
      session_duration_minutes: enrollment.session_duration_minutes,
      priority_muscles: enrollment.priority_muscles,
      started_at: todayJST(),
    })
    .select()
    .single()

  if (newEnrollError || !newEnrollment) return dbError('新しいプログラムの作成に失敗しました', newEnrollError)

  // 種目の選び直しをさせず、同じスロット割り当て（非表示状態も含む）をそのままコピー
  const newSlotRows = assignments.map(a => ({
    user_id: user.id,
    enrollment_id: newEnrollment.id,
    slot_id: a.slot_id,
    exercise_id: a.exercise_id,
    is_hidden: a.is_hidden,
  }))

  const { error: saError } = await supabase.from('user_slot_assignments').insert(newSlotRows)
  if (saError) return dbError('種目割り当ての引き継ぎに失敗しました', saError)

  if (newOneRms.length > 0) {
    const { error: ormError } = await supabase
      .from('user_slot_one_rms')
      .insert(
        newOneRms.map(orm => ({
          user_id: user.id,
          slot_id: orm.slot_id,
          one_rm_kg: orm.one_rm_kg,
          recorded_at: todayJST(),
          source: 'w9_amrap_estimation',
        }))
      )
    if (ormError) return dbError('1RMの更新に失敗しました', ormError)
  }

  return NextResponse.json({ enrollment_id: newEnrollment.id, updated_1rm_count: newOneRms.length })
}
