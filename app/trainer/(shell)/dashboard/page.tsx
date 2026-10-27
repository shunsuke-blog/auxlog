import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardPlus, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadDashboard } from '@/lib/trainer/dashboard_data'
import { formatActivityTime, HIGHLIGHT_DAYS } from '@/lib/trainer/dashboard'
import { loadPlanUsage } from '@/lib/trainer/plan_usage'
import { getTeamContext, isManagerOnly, loadUsableTemplates } from '@/lib/trainer/team'
import { getTrainerProfile } from '@/lib/trainer/session'
import AddTraineeButton from '../AddTraineeButton'
import { ProgressBar } from '../TraineeListItem'
import ActionBand, { type Item } from './ActionBand'
import { upgradeHint } from '@/lib/trainer/billing'

const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/').replace(/^0/, '')

// トレーナーのダッシュボード（2026-10-25、オーナーのデザイン案の配置。色は他のタブと同じ）。ログインした時の最初の画面。
// 一番上: 対応すること（アラート・ToDo）。その下: 数字のカード。左: 最近のアクティビティ・成果のハイライト。
// 右: 今週の進捗。スマホは縦に並べる。人の名前を押すとクライアント一覧の詳細を開く。
export default async function TrainerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const now = new Date()
  const [data, profile, team] = await Promise.all([
    loadDashboard(supabase, user.id, now),
    getTrainerProfile(supabase, user.id),
    getTeamContext(supabase, user.id),
  ])
  if (isManagerOnly(team)) redirect('/trainer/team')
  const [plan, templateOptions] = await Promise.all([
    loadPlanUsage(supabase, user.id, profile?.plan ?? 'starter', team),
    loadUsableTemplates(supabase, user.id, team),
  ])
  const limitReached = plan.limit != null && data.usedSlots >= plan.limit
  const { week, activity, highlights, todos } = data
  // ToDo: やることを先に書く。アラート: 今の様子（契約者一覧のアラートと同じ文言）
  const todoItems: Item[] = [
    ...todos.filter(t => t.kind === 'waiting_plan').map(t => ({ ...t, text: '次のプランを共有する' })),
    ...data.finalWeek.map(p => ({ ...p, text: 'プランが最終週です。次のプランを準備する' })),
    ...data.repeatedSkips,
    ...todos.filter(t => t.kind === 'invite_expired').map(t => ({ ...t, text: '招待コードを再発行する（期限切れ）' })),
    ...data.pendingInvites,
  ]
  const alertItems: Item[] = [
    ...todos.filter(t => t.kind === 'no_record' || t.kind === 'stalled').map(t => ({ linkId: t.linkId, name: t.name, text: t.message })),
    ...data.notStarted,
    ...data.shortfalls,
  ]

  return (
    <div>
      <div className="sticky top-0 z-10 trainer-header h-14 md:h-[72px] px-4 md:px-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-white whitespace-nowrap">ダッシュボード</h1>
        <div className="flex items-center gap-2">
          <AddTraineeButton templates={templateOptions} label="クライアントを追加" iconOnlyOnMobile limitReached={limitReached} limit={plan.limit ?? 0} planLabel={plan.label} upgrade={upgradeHint(plan.plan)} />
          <Link
            href="/trainer/programs?create=1"
            aria-label="プログラムを作成"
            title="プログラムを作成"
            className="h-10 flex items-center gap-1.5 px-2.5 md:px-4 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium"
          >
            {/* スマホはプログラムのマーク（＋）だけ、PC は今までどおり文字付き */}
            <ClipboardPlus className="w-5 h-5 md:hidden" />
            <Pencil className="hidden md:block w-4 h-4" />
            <span className="hidden md:inline">プログラムを作成</span>
          </Link>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4">
        <ActionBand alerts={alertItems} todos={todoItems} />

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 ">クイック統計</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 契約中とプランの残りは経営の数字なので隣に並べる（スマホは1段目、2026-10-25 オーナー指摘） */}
            <Stat label="契約中" value={`${data.activeCount}`} unit="名" />
            {/* 今のプランで契約できるクライアントの残り（招待中も数える）。上限に達して追加しようとして初めて気づく、を防ぐ */}
            <Stat
              label={`${plan.label}の残り`}
              value={plan.limit == null ? '無制限' : `${Math.max(0, plan.limit - data.usedSlots)}`}
              unit={plan.limit == null ? undefined : '人'}
              note={plan.limit == null ? undefined : `${plan.limit}人まで`}
            />
            <Stat label="今週完了した種目" value={`${week.done} / ${week.total}`} />
            <Stat label="1RM更新" value={`${highlights.length}`} unit="件" note={`直近${HIGHLIGHT_DAYS / 7}週間`} />
          </div>
        </section>

        {/* PC は左に「アクティビティ・ハイライト」、右に「今週の進捗」の2列。スマホは1列で今週の進捗を先に出す
            （列の囲みを display: contents にして order で並べる） */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="max-lg:contents lg:space-y-4">
            <Card title="最近のアクティビティ" className="max-lg:order-2">
              {activity.length === 0 ? (
                <Empty>まだアクティビティはありません。</Empty>
              ) : (
                <ol>
                  {activity.map((e, i) => {
                    const t = formatActivityTime(e.at, now)
                    return (
                      <li key={`${e.kind}-${e.at}-${i}`} className="flex gap-3">
                        <div className="w-12 shrink-0 pt-0.5 text-xs text-zinc-500 tabular-nums leading-snug">
                          <p>{t.day}</p>
                          {t.time && <p>{t.time}</p>}
                        </div>
                        <Link href={`/trainer?id=${e.linkId}`} className="flex-1 min-w-0 pb-4 pl-4 border-l border-line text-sm text-black dark:text-white leading-relaxed hover:underline">
                          <span className="font-semibold">{e.name}</span> {e.text}
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>

            <Card title="成果のハイライト" className="max-lg:order-3">
              {highlights.length === 0 ? (
                <Empty>直近{HIGHLIGHT_DAYS / 7}週間で推定1RMを更新した種目はまだありません。</Empty>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {highlights.map(h => (
                    <li key={`${h.linkId}-${h.exercise}`}>
                      <Link href={`/trainer?id=${h.linkId}`} className="flex items-center gap-3 py-2.5 hover:underline">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-black dark:text-white truncate"><span className="font-semibold">{h.name}</span><span className="ml-2">{h.exercise}</span></p>
                          <p className="text-xs text-zinc-500 tabular-nums">推定1RM {h.beforeKg}kg → {h.recentKg}kg（{fmtDay(h.trainedOn)}）</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-black dark:text-white">+{h.gainKg}kg</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="max-lg:contents lg:space-y-4">
            <Card title="今週の進捗" className="max-lg:order-1">
              {week.people.length === 0 ? (
                <Empty>進行中のプランがあるクライアントはいません。</Empty>
              ) : (
                <ul className="space-y-4">
                  {week.people.map(p => {
                    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
                    return (
                      <li key={p.linkId} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold text-black dark:text-white truncate">{p.name}</p>
                          <Link href={`/trainer?id=${p.linkId}`} className="shrink-0 text-xs text-zinc-500 hover:text-black dark:hover:text-white">詳細を開く</Link>
                        </div>
                        <ProgressBar done={p.done} total={p.total} />
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                          {p.week != null && `Week ${p.week} | `}進行状況: {p.done} / {p.total} 種目 完了 ({pct}%){p.skipped > 0 && `（スキップ ${p.skipped}）`}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`px-4 md:px-5 py-4 rounded-2xl trainer-card space-y-3 ${className}`}>
      <h2 className="text-xs font-semibold text-zinc-400 ">{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="px-3 md:px-4 py-3 md:py-4 rounded-2xl trainer-card">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {label}:{note && <span className="hidden md:inline text-zinc-400">（{note}）</span>}
      </p>
      <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-black dark:text-white">
        {value}{unit && <span className="ml-0.5 text-base md:text-lg">{unit}</span>}
      </p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-zinc-500">{children}</p>
}
