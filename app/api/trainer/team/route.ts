import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { cancelOwnPlanForTeam } from '@/lib/trainer/billing'

// ビジネスプランのチームの操作（2026-10-26）。権限・人数の判定はすべて DB の関数（lib/sql/trainer_team_2026-10-26.sql）。
const ActionSchema = z.discriminatedUnion('action', [
  // display_name: 管理者の表示名（管理者用の登録ページでは仮の名前で登録しているため、ここで決めてもらう）
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(40), display_name: z.string().trim().min(1).max(40).optional(), owner_is_trainer: z.boolean().default(true) }),
  z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal('reissue_invite') }),
  z.object({ action: z.literal('join'), code: z.string().trim().min(4).max(16) }),
  z.object({ action: z.literal('decide'), membership_id: z.string().uuid(), approve: z.boolean() }),
  z.object({ action: z.literal('remove'), membership_id: z.string().uuid() }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('owner_is_trainer'), value: z.boolean() }),
  z.object({ action: z.literal('reassign'), link_id: z.string().uuid(), to_trainer: z.string().uuid() }),
])

export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const a = parsed.data

  const call = (() => {
    switch (a.action) {
      case 'create': return createTeam(a.name, a.owner_is_trainer, a.display_name)
      case 'rename': return supabase.rpc('rename_team', { p_name: a.name })
      case 'reissue_invite': return supabase.rpc('reissue_team_invite')
      case 'join': return supabase.rpc('join_team', { p_code: a.code })
      case 'decide': return supabase.rpc('decide_team_member', { p_membership_id: a.membership_id, p_approve: a.approve })
      case 'remove': return supabase.rpc('remove_team_member', { p_membership_id: a.membership_id })
      case 'leave': return supabase.rpc('leave_team')
      case 'owner_is_trainer': return supabase.rpc('set_team_owner_is_trainer', { p_value: a.value })
      case 'reassign': return supabase.rpc('reassign_trainee_link', { p_link_id: a.link_id, p_to_trainer: a.to_trainer })
    }
  })()
  async function createTeam(name: string, ownerIsTrainer: boolean, displayName?: string) {
    // 表示名の変更は register_as_trainer（登録済みなら名前を更新する）
    if (displayName) {
      const renamed = await supabase.rpc('register_as_trainer', { p_display_name: displayName })
      if (renamed.error) return renamed
    }
    return supabase.rpc('create_team', { p_name: name, p_owner_is_trainer: ownerIsTrainer })
  }

  const { data, error } = await call
  // 「担当する」を外せない時: メンバーがいなければ担当替えの先が無いので、別の案内にする（2026-10-26 オーナー指摘）
  if (error?.hint === 'owner_has_clients') {
    const { data: org } = await supabase.from('organizations').select('id').eq('owner_user_id', user.id).maybeSingle()
    const { count } = org
      ? await supabase.from('organization_memberships').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'approved')
      : { count: 0 }
    if (!count) {
      return NextResponse.json({ error: 'ご自身が担当しているクライアントがいます。トレーナーを招待して担当替えするか、契約を終了してから変更してください' }, { status: 409 })
    }
  }
  if (error) return trainerRpcError(error, 'チームの操作に失敗しました')

  // 承認したメンバーが自分で有料プラン（ベーシック・プロ）を払っていれば、今の期間の終わりで解約する（二重に払わないため、2026-10-26）。
  // 承認は確定済みなので、失敗しても承認は取り消さず、運営が手で解約できるようにメールで知らせる
  if (a.action === 'decide' && a.approve) {
    const service = createServiceClient()
    const { data: membership } = await service.from('organization_memberships').select('trainer_id').eq('id', a.membership_id).maybeSingle()
    if (membership) {
      await cancelOwnPlanForTeam(service, membership.trainer_id).catch(e => {
        console.error('[team-approve] failed to cancel member subscription', { trainerId: membership.trainer_id, error: e })
        return notifySupport('[要対応] チーム承認時の有料プラン解約に失敗',
          `メンバーのトレーナー ${membership.trainer_id} の有料プランを期間の終わりで解約できませんでした。Stripe で手動で解約してください。\n\n${e instanceof Error ? e.message : String(e)}`)
      })
    }
  }
  return NextResponse.json({ ok: true, data })
}

async function notifySupport(subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) return
  await new Resend(process.env.RESEND_API_KEY).emails
    .send({ from: 'Auxlog <noreply@bloomines.com>', to: 'auxlog.support@gmail.com', subject, text })
    .catch(e => console.error('[team-approve] failed to notify support', e))
}
