import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrainerPlan } from './session'

// ビジネスプランのチーム（2026-10-26）。DB の判定は lib/sql/trainer_team_2026-10-26.sql。
// チームが有効なのは管理者のプランがビジネスの間だけ（管理者が解約するとメンバーは自分のプランに戻る）。

/** ビジネスプランの基本のトレーナー枠。4名以上はご相談のうえ追加（organizations.extra_trainer_seats） */
export const TEAM_BASE_TRAINERS = 3

/** 管理だけの管理者（クライアントを担当しない）。ダッシュボード・クライアント一覧は出さず、チームを最初の画面にする（2026-10-26 オーナー決定） */
export function isManagerOnly(team: TeamContext): boolean {
  return team.role === 'owner' && team.active && !team.ownerIsTrainer
}

export type TeamMember = { membershipId: string; trainerId: string; name: string; status: 'pending' | 'approved' }

export type TeamContext =
  | { role: 'none' }
  /** 参加を申請中（管理者の承認待ち） */
  | { role: 'pending'; orgName: string | null }
  | { role: 'member'; orgId: string; orgName: string; ownerId: string; ownerName: string; active: boolean }
  | { role: 'owner'; orgId: string; orgName: string; ownerIsTrainer: boolean; seatLimit: number; active: boolean; inviteCode: string | null; members: TeamMember[] }

export async function getTeamContext(supabase: SupabaseClient, userId: string): Promise<TeamContext> {
  const { data: owned } = await supabase
    .from('organizations')
    .select('id, name, owner_is_trainer, owner_user_id, extra_trainer_seats')
    .eq('owner_user_id', userId)
    .maybeSingle()
  if (owned) {
    const [{ data: profile }, { data: invite }, { data: memberships }] = await Promise.all([
      supabase.from('trainer_profiles').select('plan').eq('user_id', userId).maybeSingle(),
      supabase.from('organization_invites').select('code').eq('organization_id', owned.id).is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('organization_memberships').select('id, trainer_id, status').eq('organization_id', owned.id).in('status', ['pending', 'approved']).order('created_at'),
    ])
    const ids = (memberships ?? []).map(m => m.trainer_id as string)
    const { data: names } = ids.length > 0
      ? await supabase.from('trainer_profiles').select('user_id, display_name').in('user_id', ids)
      : { data: [] as { user_id: string; display_name: string }[] }
    const nameOf = new Map((names ?? []).map(n => [n.user_id, n.display_name]))
    return {
      role: 'owner',
      orgId: owned.id,
      orgName: owned.name,
      ownerIsTrainer: owned.owner_is_trainer,
      seatLimit: TEAM_BASE_TRAINERS + (owned.extra_trainer_seats ?? 0),
      active: profile?.plan === 'business',
      inviteCode: invite?.code ?? null,
      members: (memberships ?? []).map(m => ({ membershipId: m.id, trainerId: m.trainer_id, name: nameOf.get(m.trainer_id) ?? 'トレーナー', status: m.status })),
    }
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, status')
    .eq('trainer_id', userId)
    .in('status', ['pending', 'approved'])
    .maybeSingle()
  if (!membership) return { role: 'none' }
  // 申請中は組織を読めない（RLS: 管理者と承認済みのメンバーだけ）
  const { data: org } = await supabase.from('organizations').select('id, name, owner_user_id').eq('id', membership.organization_id).maybeSingle()
  if (membership.status === 'pending' || !org) return { role: 'pending', orgName: org?.name ?? null }
  const { data: owner } = await supabase.from('trainer_profiles').select('display_name, plan').eq('user_id', org.owner_user_id).maybeSingle()
  return {
    role: 'member',
    orgId: org.id,
    orgName: org.name,
    ownerId: org.owner_user_id,
    ownerName: owner?.display_name ?? '管理者',
    // 管理者のプランが読めない（チームが無効で is_teammate が外れた）時も無効として扱う
    active: owner?.plan === 'business',
  }
}

/** 実際に使えるプランとクライアントの上限（DB の trainer_effective_plan / trainer_trainee_limit と同じ） */
export function effectivePlan(plan: TrainerPlan, team: TeamContext): { plan: TrainerPlan; limitOverride?: number } {
  if (team.role === 'member' && team.active) return { plan: 'business' }
  if (team.role === 'owner' && team.active && !team.ownerIsTrainer) return { plan: 'business', limitOverride: 0 }
  return { plan }
}

/** チームのトレーナーの数（承認済みのメンバー＋クライアントを担当する管理者） */
export function teamTrainerCount(team: Extract<TeamContext, { role: 'owner' }>): number {
  return team.members.filter(m => m.status === 'approved').length + (team.ownerIsTrainer ? 1 : 0)
}

/** クライアントの追加・自分への割り当てで選べるテンプレート: 自分のもの＋（チームのメンバーなら）管理者のもの */
export async function loadUsableTemplates(supabase: SupabaseClient, userId: string, team: TeamContext): Promise<{ id: string; name: string }[]> {
  const owners = team.role === 'member' && team.active ? [userId, team.ownerId] : [userId]
  const { data } = await supabase
    .from('coaching_plans')
    .select('id, name, trainer_id')
    .is('link_id', null)
    .in('trainer_id', owners)
    .order('updated_at', { ascending: false })
  return (data ?? []).map(t => ({ id: t.id as string, name: t.trainer_id === userId ? (t.name as string) : `${t.name}（チーム）` }))
}
