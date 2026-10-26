import type { SupabaseClient } from '@supabase/supabase-js'
import { TRAINER_PLANS } from './dashboard'
import type { TrainerPlan } from './session'

// 今のプランの上限と、上限に数える契約の数（招待中・契約中・一時停止中、自分は除く。DB の trainer_over_limit と同じ）
export async function loadPlanUsage(supabase: SupabaseClient, trainerId: string, plan: TrainerPlan) {
  const { count } = await supabase
    .from('trainer_trainee_links')
    .select('id, trainee_id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .in('status', ['invited', 'active', 'paused'])
    .or(`trainee_id.is.null,trainee_id.neq.${trainerId}`)
  const used = count ?? 0
  const { label, limit } = TRAINER_PLANS[plan]
  return { label, limit, used, over: limit != null && used > limit }
}
