import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError, notFound } from '@/lib/api/errors'
import { computeWeek9Completion } from '@/lib/program/week9-report'

// Week9(MaxOut)の全種目を記録し終えた時点で、まだ次のサイクルを開始する前に
// 成長レポート（1RMの伸び・総トレーニング回数・総重量）をプレビューできる、
// 読み取り専用のエンドポイント（DBへの書き込みは一切行わない）。
//
// 「次のプログラムを始める」を確定させてからレポートを見せる旧UXは、褒める瞬間が
// 確定操作の後ろに隠れてしまい体験として不自然だったため、2026-08-31に
// 「成果を先に見せてから、次に進むか決めてもらう」順序に変更した。
export async function GET(request: Request) {
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
    return NextResponse.json({ error: 'Week9（最終週）完了後のみ成長レポートを見られます' }, { status: 400 })
  }

  const result = await computeWeek9Completion(supabase, user, enrollment)
  if ('error' in result) return dbError(result.error)
  if (!result.allComplete) {
    return NextResponse.json({ error: 'Week9の全種目がまだ記録されていません' }, { status: 400 })
  }

  return NextResponse.json({ growth_report: result.growthReport })
}
