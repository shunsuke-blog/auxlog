import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { getTeamContext, teamTrainerCount } from '@/lib/trainer/team'
import { loadTraineeRows } from '@/lib/trainer/trainees'
import TraineeListItem from '../TraineeListItem'
import TraineeDetailPanel from '../TraineeDetailPanel'
import InquiryForm from '@/components/trainer/InquiryForm'
import {
  InviteCode, JoinTeamForm, LeaveTeamButton, MemberRequestActions, OwnerIsTrainerToggle, RemoveMemberButton, RenameTeam,
} from './TeamActions'

// ビジネスプランのチーム（2026-10-26 オーナー決定）。
// - チームが無い: ビジネスなら作成、そうでなければ招待コードで参加を申請
// - メンバー: チームの名前・管理者・抜ける
// - 管理者: 招待コード・トレーナーの承認／外す・自分も担当するか・メンバーのクライアントの閲覧（?member=）と担当替え
export default async function TrainerTeamPage({ searchParams }: { searchParams: Promise<{ member?: string; id?: string }> }) {
  const { member: memberId, id: selectedId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [profile, team, { data: sub }] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    getTeamContext(supabase, user.id),
    supabase.from('trainer_profiles').select('subscription_status, cancel_at_period_end, current_period_end').eq('user_id', user.id).maybeSingle(),
  ])
  // 自分で有料プラン（ベーシック・プロ）を払っている人は、承認された時に今の期間の終わりで自動で解約される（2026-10-26 オーナー決定）
  const ownPlanRenews = (profile?.plan === 'basic' || profile?.plan === 'pro') && sub != null && !sub.cancel_at_period_end
    && ['active', 'trialing', 'past_due'].includes(sub.subscription_status ?? '')

  const header = (
    <div className="sticky top-0 z-10 trainer-header h-14 md:h-[72px] px-4 md:px-6 flex items-center">
      <h1 className="text-xl font-semibold text-black dark:text-white">チーム</h1>
    </div>
  )

  // 管理者がメンバーのクライアントを見る
  if (team.role === 'owner' && team.active && memberId) {
    const member = team.members.find(m => m.trainerId === memberId && m.status === 'approved')
    if (member) {
      const rows = (await loadTraineeRows(supabase, member.trainerId)).filter(r => !r.isSelf)
      const selected = rows.find(r => r.linkId === selectedId) ?? null
      const trainers = [
        ...(team.ownerIsTrainer ? [{ id: user.id, name: `${profile?.display_name ?? '自分'}（自分）` }] : []),
        ...team.members.filter(m => m.status === 'approved').map(m => ({ id: m.trainerId, name: m.name })),
      ]
      return (
        <div className="md:h-screen md:flex md:flex-col">
          <div className={`sticky top-0 z-10 shrink-0 trainer-header h-14 md:h-[72px] px-4 md:px-6 items-center gap-2 ${selected ? 'hidden md:flex' : 'flex'}`}>
            <Link href="/trainer/team" className="p-1 -ml-1 text-zinc-400 hover:text-black" aria-label="チームに戻る"><ChevronLeft className="w-5 h-5" /></Link>
            <h1 className="text-xl font-semibold text-black truncate">{member.name} さんのクライアント</h1>
          </div>
          <div className="md:flex md:flex-1 md:min-h-0">
            <section className={`md:w-[420px] md:shrink-0 md:border-r border-zinc-100 md:overflow-y-auto ${selected ? 'hidden md:block' : ''}`}>
              <div className="px-4 py-4 space-y-2">
                {rows.length === 0
                  ? <p className="text-sm text-zinc-400 text-center py-10">担当しているクライアントはいません。</p>
                  : rows.map(r => <TraineeListItem key={r.linkId} row={r} selected={r.linkId === selected?.linkId} href={`/trainer/team?member=${member.trainerId}&id=${r.linkId}`} />)}
              </div>
            </section>
            <section className={`flex-1 md:overflow-y-auto ${selected ? '' : 'hidden md:block'}`}>
              {selected ? (
                <>
                  <Link href={`/trainer/team?member=${member.trainerId}`} className="md:hidden flex items-center gap-1 px-4 pt-4 text-sm text-zinc-500">
                    <ChevronLeft className="w-4 h-4" />
                    一覧
                  </Link>
                  <TraineeDetailPanel row={selected} templates={[]} selfName="" readOnly reassign={{ currentTrainerId: member.trainerId, trainers }} />
                </>
              ) : (
                <div className="flex items-center justify-center h-full py-24 text-sm text-zinc-400">クライアントを選ぶと、ここに詳細が表示されます</div>
              )}
            </section>
          </div>
        </div>
      )
    }
  }

  return (
    <div>
      {header}
      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 max-w-2xl">
        {team.role === 'none' && (
          <>
            {/* ビジネスでチームが無い人は (shell)/layout.tsx で /trainer/team-setup に移るので、ここは作成の案内だけ */}
            <Card title="チームで使う">
              <p className="text-sm text-zinc-500">ビジネスプランでは、複数のトレーナーでクライアントとプログラムをまとめて管理できます。</p>
              <div className="px-4 py-3 rounded-xl border border-line space-y-0.5">
                <p className="text-sm font-semibold text-black">トレーナー3名まで ¥19,800 / 月（税込）</p>
                <p className="text-xs text-zinc-500">4名以上はご相談ください。</p>
              </div>
              <p className="text-sm text-zinc-500">お申し込みは、お問い合わせのうえで承ります。</p>
              <InquiryForm kind="business" />
            </Card>
            <Card title="チームに参加する">
              <p className="text-sm text-zinc-500">管理者から受け取った招待コードを入力してください。管理者が承認すると参加できます。参加中はチームのビジネスプランで、クライアントを無制限に担当できます。</p>
              {ownPlanRenews && (
                <p className="text-sm text-black">
                  ご自身の{profile?.plan === 'basic' ? 'ベーシックプラン' : 'プロプラン'}は、参加が承認されると{sub?.current_period_end ? `今のお支払い期間の終わり（${new Date(sub.current_period_end).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })}）で` : '今のお支払い期間の終わりで'}自動で解約されます。
                  承認された時からチームのプランで使えます（お支払い済みの期間の返金はありません）。
                </p>
              )}
              <JoinTeamForm />
            </Card>
          </>
        )}

        {team.role === 'pending' && (
          <Card title="参加の申請中">
            <p className="text-sm text-black">{team.orgName ? `${team.orgName} への` : 'チームへの'}参加を申請しています。管理者の承認をお待ちください。</p>
            <LeaveTeamButton pending />
          </Card>
        )}

        {team.role === 'member' && (
          <Card title="参加中のチーム">
            <p className="text-base font-semibold text-black">{team.orgName}</p>
            <p className="text-sm text-zinc-500">管理者: {team.ownerName} さん</p>
            {team.active ? (
              <p className="text-sm text-zinc-500">チームのビジネスプランで、クライアントを無制限に担当できます。管理者が作ったプログラムは、クライアントの追加の時に選べます。</p>
            ) : (
              <p className="text-sm text-red-600">管理者のビジネスプランが終了しているため、チームの機能は止まっています（ご自身のプランで使えます）。</p>
            )}
            <LeaveTeamButton pending={false} />
          </Card>
        )}

        {team.role === 'owner' && (
          <>
            {!team.active && (
              <p className="px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
                ビジネスプランが終了しているため、チームは止まっています。メンバーはそれぞれのプランで使っています。<Link href="/trainer/settings" className="ml-1 underline">プランを見る</Link>
              </p>
            )}
            <Card title="チーム">
              <RenameTeam name={team.orgName} />
              <p className="text-sm text-zinc-500 tabular-nums">トレーナー {teamTrainerCount(team)} / {team.seatLimit}名</p>
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">トレーナーを増やす場合はお問い合わせください。</p>
                <InquiryForm kind="seats" />
              </div>
              <OwnerIsTrainerToggle value={team.ownerIsTrainer} />
            </Card>

            <Card title="招待コード">
              <p className="text-sm text-zinc-500">参加してほしいトレーナーに伝えてください。トレーナー画面の「チーム」で入力すると、ここに参加の申請が届きます。</p>
              <InviteCode code={team.inviteCode} />
            </Card>

            <OwnerMembers team={team} />
          </>
        )}
      </div>
    </div>
  )
}

async function OwnerMembers({ team }: { team: Extract<Awaited<ReturnType<typeof getTeamContext>>, { role: 'owner' }> }) {
  const supabase = await createClient()
  const approved = team.members.filter(m => m.status === 'approved')
  const pending = team.members.filter(m => m.status === 'pending')
  // 担当中のクライアント数（招待中・契約中・一時停止中。自分自身との契約は除く）。RLS で管理者はメンバーの契約を読める
  const { data: links } = approved.length > 0
    ? await supabase.from('trainer_trainee_links').select('trainer_id, trainee_id').in('trainer_id', approved.map(m => m.trainerId)).in('status', ['invited', 'active', 'paused'])
    : { data: [] as { trainer_id: string; trainee_id: string | null }[] }
  const countOf = (id: string) => (links ?? []).filter(l => l.trainer_id === id && l.trainee_id !== id).length

  return (
    <>
      {pending.length > 0 && (
        <Card title={`参加の申請（${pending.length}件）`}>
          <ul className="divide-y divide-zinc-100">
            {pending.map(m => (
              <li key={m.membershipId} className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm font-semibold text-black">{m.name}</p>
                <MemberRequestActions membershipId={m.membershipId} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="トレーナー">
        {approved.length === 0 ? (
          <p className="text-sm text-zinc-500">まだ参加しているトレーナーはいません。</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {approved.map(m => (
              <li key={m.membershipId} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black truncate">{m.name}</p>
                  <p className="text-xs text-zinc-500 tabular-nums">担当中のクライアント {countOf(m.trainerId)}名</p>
                </div>
                {team.active && (
                  <Link href={`/trainer/team?member=${m.trainerId}`} className="shrink-0 inline-flex items-center gap-0.5 text-sm text-brand-text hover:underline">
                    クライアントを見る<ChevronRight className="w-4 h-4" />
                  </Link>
                )}
                <RemoveMemberButton membershipId={m.membershipId} name={m.name} clientCount={countOf(m.trainerId)} />
              </li>
            ))}
          </ul>
        )}
        {team.ownerIsTrainer && (
          <p className="text-xs text-zinc-500">ご自身のクライアントの担当替えは、クライアント一覧の詳細から行えます。</p>
        )}
      </Card>
    </>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 rounded-2xl trainer-card space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400">{title}</h2>
      {children}
    </section>
  )
}
