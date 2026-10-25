import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getLivePlan, getTraineeLink, loadPlanOverview } from '@/lib/coaching/trainee'

// アプリのプログラムタブ（トレーナーのプラン、閲覧のみ）。Web の CoachingPlanView と同じ内容
export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await getTraineeLink(supabase, user.id)
  const plan = link?.status === 'active' ? await getLivePlan(supabase, link.linkId) : null
  if (!link || !plan) return NextResponse.json({ error: '進行中のプランがありません' }, { status: 404 })
  return NextResponse.json({ trainer_name: link.trainerName, plan, overview: await loadPlanOverview(supabase, plan) })
}
