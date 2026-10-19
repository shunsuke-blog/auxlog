import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getLivePlan, getTraineeLink } from '@/lib/coaching/trainee'
import { computePlanGrowthReport } from '@/lib/coaching/plan_report'
import { todayJST } from '@/lib/program/week9-report'

// 進行中のコーチングプランの成長レポート（読み取りのみ。完了は /api/coaching-plan/finish）
export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await getTraineeLink(supabase, user.id)
  const plan = link?.status === 'active' ? await getLivePlan(supabase, link.linkId) : null
  if (!plan) return NextResponse.json({ error: '進行中のプランがありません' }, { status: 404 })

  const { data: row } = await supabase.from('coaching_plans').select('started_at').eq('id', plan.id).single()
  const report = await computePlanGrowthReport(supabase, { id: plan.id, startedAt: row?.started_at ?? null }, todayJST())
  return NextResponse.json({ growth_report: report, total_weeks: plan.totalWeeks })
}
