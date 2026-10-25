import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadDashboard } from '@/lib/trainer/dashboard_data'
import { FREE_TRAINEE_LIMIT, formatActivityTime, HIGHLIGHT_DAYS } from '@/lib/trainer/dashboard'
import AddTraineeButton, { type TemplateOption } from '../AddTraineeButton'
import { ProgressBar } from '../TraineeListItem'

const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/').replace(/^0/, '')

// トレーナーのダッシュボード（2026-10-25、オーナーのデザイン案の配置。色は他のタブと同じ）。ログインした時の最初の画面。
// 上: 数字のカード（契約中・今週完了した種目・1RM更新）。左: 最近のアクティビティ・成果のハイライト。
// 右: 今週の進捗・ToDo・アラート。スマホは縦に並べる。人の名前を押すと契約者一覧の詳細を開く。
export default async function TrainerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const now = new Date()
  const [data, { data: templates }] = await Promise.all([
    loadDashboard(supabase, user.id, now),
    supabase.from('coaching_plans').select('id, name').is('link_id', null).order('updated_at', { ascending: false }),
  ])
  const templateOptions: TemplateOption[] = (templates ?? []).map(t => ({ id: t.id as string, name: t.name as string }))
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
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-white">ダッシュボード</h1>
        <div className="flex items-center gap-2">
          <AddTraineeButton templates={templateOptions} label="契約者を追加" />
          <Link
            href="/trainer/programs?create=1"
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium"
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden sm:inline">プログラムを作成</span>
            <span className="sm:hidden">作成</span>
          </Link>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4">
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">クイック統計</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="契約中" value={`${data.activeCount}`} unit="名" />
            <Stat label="今週完了した種目" value={`${week.done} / ${week.total}`} />
            <Stat label="1RM更新" value={`${highlights.length}`} unit="件" note={`直近${HIGHLIGHT_DAYS / 7}週間`} />
            {/* 無料で契約できる人数の残り。上限に達して追加しようとして初めて気づく、を防ぐ */}
            <Stat label="招待できる残り" value={`${Math.max(0, FREE_TRAINEE_LIMIT - data.usedSlots)}`} unit="人" note={`無料 ${FREE_TRAINEE_LIMIT}人まで`} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <Card title="最近のアクティビティ">
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
                        {/* 時系列の線と点 */}
                        <div className="relative w-3 shrink-0 flex justify-center">
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-zinc-300" />
                          {i < activity.length - 1 && <span className="absolute top-4 bottom-0 w-px bg-zinc-200" />}
                        </div>
                        <Link href={`/trainer?id=${e.linkId}`} className="flex-1 min-w-0 pb-4 text-sm text-black dark:text-white leading-relaxed hover:underline">
                          <span className="font-semibold">{e.name}</span> が{e.text}
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>

            <Card title="成果のハイライト">
              {highlights.length === 0 ? (
                <Empty>直近{HIGHLIGHT_DAYS / 7}週間で推定1RMを更新した種目はまだありません。</Empty>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {highlights.map(h => (
                    <li key={`${h.linkId}-${h.exercise}`}>
                      <Link href={`/trainer?id=${h.linkId}`} className="flex items-center gap-3 py-2.5 hover:underline">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-black dark:text-white truncate"><span className="font-semibold">{h.name}</span> · {h.exercise}</p>
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

          <div className="space-y-4">
            <Card title="今週の進捗">
              {week.people.length === 0 ? (
                <Empty>進行中のプランがある契約者はいません。</Empty>
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
                          {p.week != null && `Week ${p.week} | `}進行状況: {p.done} / {p.total} 種目 完了 ({pct}%){p.skipped > 0 && ` · スキップ ${p.skipped}`}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            {/* ToDo（トレーナーがやる作業）とアラート（トレーニーの様子の異変）を分ける（2026-10-25 オーナー決定）。
                該当者がいない項目は出さない */}
            <Card title="ToDo">
              {todoItems.length === 0 ? (
                <Empty>ToDoはありません。</Empty>
              ) : (
                <ItemList items={todoItems} />
              )}
            </Card>

            <Card title="アラート">
              {alertItems.length === 0 ? (
                <Empty>アラートはありません。</Empty>
              ) : (
                <ItemList items={alertItems} urgent />
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 md:px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="px-3 md:px-4 py-3 md:py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {label}:{note && <span className="hidden md:inline text-zinc-400">（{note}）</span>}
      </p>
      <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-black dark:text-white">
        {value}{unit && <span className="ml-0.5 text-base md:text-lg">{unit}</span>}
      </p>
    </div>
  )
}

type Item = { linkId: string; name: string; text: string }

function ItemList({ items, urgent }: { items: Item[]; urgent?: boolean }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {items.map((it, i) => (
        <li key={`${it.linkId}-${i}`}>
          <Link href={`/trainer?id=${it.linkId}`} className="flex items-start gap-2.5 py-2.5 hover:underline">
            <span className={`mt-2 w-1.5 h-1.5 shrink-0 rounded-full ${urgent ? 'bg-red-500' : 'bg-zinc-400'}`} />
            <p className="text-sm text-black dark:text-white">
              <span className="font-semibold">{it.name}</span>
              <span className={urgent ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}>: {it.text}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-zinc-500">{children}</p>
}
