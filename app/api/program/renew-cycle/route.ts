import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError, notFound } from '@/lib/api/errors'
import { computeWeek9Completion, todayJST } from '@/lib/program/week9-report'

// Week9(MaxOut)完了後、実績（トップセット=AMRAP対象種目の重量×回数）から1RMを自動推定し、
// 種目の選び直しをさせずに次の9週間プログラムを開始する。
// 手動リセット（api/program/reset）と異なり、旧enrollmentは削除せずis_active=falseに
// するだけなのでトレーニング履歴は失われない。1RMも新しい行をinsertするだけで良い
// （user_slot_one_rmsはenrollment_idを持たず、recorded_at最新の行が常に採用される設計）。
//
// 完了判定・1RM推定・成長レポートの計算はapi/program/growth-report（読み取り専用の
// プレビュー）と共通のlib/program/week9-report.tsを使う（2026-08-31、成長レポートを
// 「サイクル開始の確定後」ではなく「確定前に見せる」UXに変更した際に一本化した）。
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

  const result = await computeWeek9Completion(supabase, user, enrollment)
  if ('error' in result) return dbError(result.error)
  if (!result.allComplete) {
    return NextResponse.json({ error: 'Week9の全種目がまだ記録されていません' }, { status: 400 })
  }
  const { newOneRms, assignments, growthReport } = result

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

  return NextResponse.json({
    enrollment_id: newEnrollment.id,
    updated_1rm_count: newOneRms.length,
    growth_report: growthReport,
  })
}
