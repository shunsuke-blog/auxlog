import type { SupabaseClient } from '@supabase/supabase-js'
import { getLivePlan, getTraineeLink, loadCoachingWeek, type CoachingDay, type LivePlan, type TraineeLink } from './trainee'
import { autoCreateSelfProgramAfterContract } from '@/lib/program/auto_self_program'

// ホームに何を出すかの判定。Web のホーム（app/(app)/page.tsx）とアプリ用の API（GET /api/trainee/state）で共通。
// - coaching: トレーナーと契約中で、進行中のプランがある
// - waiting: 契約中だがプランが無い（次のプランを準備中）／一時停止中
// - self: セルフモードのプログラムがある（契約が終わった直後は、記録からここで自動で作る）
// - none: どちらも無い（オンボーディングへ）
export type TraineeHome =
  | { mode: 'coaching'; link: TraineeLink; plan: LivePlan; days: CoachingDay[] }
  | { mode: 'waiting'; link: TraineeLink }
  | { mode: 'self' }
  | { mode: 'none' }

export async function resolveTraineeHome(supabase: SupabaseClient, userId: string): Promise<TraineeHome> {
  const link = await getTraineeLink(supabase, userId)
  if (link) {
    const plan = link.status === 'active' ? await getLivePlan(supabase, link.linkId) : null
    if (!plan) return { mode: 'waiting', link }
    return { mode: 'coaching', link, plan, days: await loadCoachingWeek(supabase, plan.id, plan.currentWeek) }
  }

  const hasEnrollment = async () => !!(await supabase
    .from('user_program_enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()).data
  if (await hasEnrollment()) return { mode: 'self' }
  // トレーナーとの契約が終わった直後は、記録から1RMを推定してセルフモードのプログラムを自動で作る
  if ((await autoCreateSelfProgramAfterContract(supabase, userId)) === 'created' && (await hasEnrollment())) return { mode: 'self' }
  return { mode: 'none' }
}
