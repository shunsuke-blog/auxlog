import type { SupabaseClient } from '@supabase/supabase-js'
import { TRAINER_PLANS } from './dashboard'
import type { TrainerPlan } from './session'
import { effectivePlan, getTeamContext, type TeamContext } from './team'

// 今のプランの上限と、上限に数える契約の数（招待中・契約中・一時停止中、自分は除く。DB の trainer_over_limit と同じ）。
// チームのメンバーはビジネス（無制限）、クライアントを担当しない管理者は 0（DB の trainer_trainee_limit と同じ）
export async function loadPlanUsage(supabase: SupabaseClient, trainerId: string, ownPlan: TrainerPlan, team?: TeamContext) {
  const [{ count }, resolvedTeam] = await Promise.all([
    supabase
      .from('trainer_trainee_links')
      .select('id', { count: 'exact', head: true })
      .eq('trainer_id', trainerId)
      .in('status', ['invited', 'active', 'paused'])
      .or(`trainee_id.is.null,trainee_id.neq.${trainerId}`),
    team ? Promise.resolve(team) : getTeamContext(supabase, trainerId),
  ])
  const used = count ?? 0
  const { plan, limitOverride } = effectivePlan(ownPlan, resolvedTeam)
  const label = TRAINER_PLANS[plan].label
  const limit = limitOverride ?? TRAINER_PLANS[plan].limit
  return { plan, label, limit, used, over: limit != null && used > limit, team: resolvedTeam }
}
