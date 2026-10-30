import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadTraineeRows } from '@/lib/trainer/trainees'
import TraineeSearchList, { TraineeSearchBox, TraineeSearchProvider } from './TraineeSearchList'
import TraineeDetailPanel from './TraineeDetailPanel'
import AddTraineeButton from './AddTraineeButton'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import { getTeamContext, isManagerOnly, loadUsableTemplates } from '@/lib/trainer/team'
import { upgradeHint } from '@/lib/trainer/billing'

// トレーニー一覧（2026-10-19 決定）: 一番上に自分自身、その下にトレーニー。契約終了はグレーで一番下。
// 名前・状態・最後に記録した日・今週の進み具合（4 / 6 種目＋バー、スキップは別表示）・アラート「！」。
// PCは左に一覧・右に詳細（?id=）、スマホは一覧 → 詳細に切り替わる。
export default async function TrainerTraineesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: selectedId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [profile, rows, team] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    loadTraineeRows(supabase, user.id),
    getTeamContext(supabase, user.id),
  ])
  if (isManagerOnly(team)) redirect('/trainer/team')
  const [plan, templateOptions] = await Promise.all([
    loadPlanUsage(supabase, user.id, profile?.plan ?? 'starter', team),
    loadUsableTemplates(supabase, user.id, team),
  ])

  const selected = rows.find(r => r.linkId === selectedId) ?? null
  const hasClients = rows.some(r => !r.isSelf)

  return (
    // 見出しの帯は一覧と詳細の両方の上に、右端まで伸ばす（2026-10-25 オーナー指摘）。PC は帯の下を一覧と詳細の2列にし、
    // それぞれをスクロールさせる。スマホで詳細を開いている時は帯を出さない（詳細に「一覧」へ戻るリンクがある）
    // 名前の検索欄も帯の中に置く（PC は帯の1行に、スマホは帯の2行目。2026-10-30 オーナー指示）
    <TraineeSearchProvider>
    <div className="md:h-screen md:flex md:flex-col">
      <div className={`sticky top-0 z-10 shrink-0 trainer-header px-4 md:px-6 ${selected ? 'hidden md:block' : ''}`}>
        <div className="h-14 md:h-[72px] flex items-center justify-between gap-3">
          <h1 className="shrink-0 text-xl font-semibold text-black dark:text-white">クライアント一覧</h1>
          {hasClients && <div className="hidden md:block ml-auto w-72"><TraineeSearchBox /></div>}
          <AddTraineeButton templates={templateOptions} limitReached={plan.limit != null && plan.used >= plan.limit} limit={plan.limit ?? 0} planLabel={plan.label} upgrade={upgradeHint(plan.plan)} />
        </div>
        {hasClients && <div className="md:hidden pb-3"><TraineeSearchBox /></div>}
      </div>
      <div className="md:flex md:flex-1 md:min-h-0">
      <section className={`md:w-[420px] md:shrink-0 md:border-r border-zinc-100 dark:border-zinc-900 md:overflow-y-auto ${selected ? 'hidden md:block' : ''}`}>
        <div className="px-4 py-4 space-y-2">
          {rows.filter(r => r.isSelf).map(r => (
            // 自分の行も他のクライアントと同じく右に詳細を出す。自分のトレーニー画面へは詳細のボタンから（2026-10-26）
            <Link
              key={r.linkId}
              href={`/trainer?id=${r.linkId}`}
              className={`block px-4 py-3.5 rounded-2xl transition-colors ${r.linkId === selected?.linkId ? 'border border-brand bg-brand-soft' : 'trainer-card hover:bg-zinc-50 dark:hover:bg-zinc-950'}`}
            >
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-black dark:text-white">{profile?.display_name ?? r.name}（自分）</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {r.plan && r.plan.status !== 'ended' ? r.plan.name : 'セルフモード'}{r.lastTrainedOn && <span className="ml-3">最終記録 {r.lastTrainedOn.slice(5).replace('-', '/')}</span>}
                </p>
              </div>
            </Link>
          ))}
          <TraineeSearchList rows={rows.filter(r => !r.isSelf)} selectedLinkId={selected?.linkId ?? null} empty="「追加」からクライアントを招待できます。" />
        </div>
      </section>

      <section className={`flex-1 md:overflow-y-auto ${selected ? '' : 'hidden md:block'}`}>
        {selected ? (
          <>
            <Link href="/trainer" className="md:hidden flex items-center gap-1 px-4 pt-4 text-sm text-zinc-500 hover:text-black dark:hover:text-white">
              <ChevronLeft className="w-4 h-4" />
              一覧
            </Link>
            <TraineeDetailPanel
              row={selected}
              templates={templateOptions}
              selfName={profile?.display_name ?? selected.name}
              // チームの管理者は、自分のクライアントをチームのトレーナーに担当替えできる（2026-10-26）
              reassign={team.role === 'owner' && team.active ? {
                currentTrainerId: user.id,
                trainers: [
                  { id: user.id, name: `${profile?.display_name ?? '自分'}（自分）` },
                  ...team.members.filter(m => m.status === 'approved').map(m => ({ id: m.trainerId, name: m.name })),
                ],
              } : undefined}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full py-24 text-sm text-zinc-400 dark:text-zinc-500">
            クライアントを選ぶと、ここに詳細が表示されます
          </div>
        )}
      </section>
      </div>
    </div>
    </TraineeSearchProvider>
  )
}
