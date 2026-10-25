import Link from 'next/link'
import { ChevronRight, CircleAlert, Clock, KeyRound, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadDashboard } from '@/lib/trainer/dashboard_data'
import { HIGHLIGHT_DAYS, type TodoItem } from '@/lib/trainer/dashboard'
import { ProgressBar } from '../TraineeListItem'

const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/').replace(/^0/, '')

const TODO_ICON: Record<TodoItem['kind'], typeof CircleAlert> = {
  no_record: CircleAlert,
  stalled: CircleAlert,
  waiting_plan: Clock,
  invite_expired: KeyRound,
}

// トレーナーのダッシュボード（2026-10-25 決定）。ログインした時の最初の画面。
// 要対応 → 今週の実施状況 → 成果のハイライト → 最近の記録。人の名前を押すと契約者一覧の詳細を開く。
// PC は左に「要対応・今週の実施状況」、右に「成果のハイライト・最近の記録」の2列、スマホは縦に並べる。
export default async function TrainerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { rows, todos, week, recent, highlights } = await loadDashboard(supabase, user.id)
  const hasTrainees = rows.some(r => !r.isSelf)

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 md:px-6 py-3 md:py-5">
        <h1 className="text-xl font-semibold text-black dark:text-white">ダッシュボード</h1>
      </div>

      {!hasTrainees ? (
        <div className="px-4 md:px-6 py-16 text-center space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ契約者がいません。契約者一覧の「追加」からトレーニーを招待できます。</p>
          <Link href="/trainer" className="inline-block px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium">契約者一覧へ</Link>
        </div>
      ) : (
        <div className="px-4 md:px-6 py-4 md:py-6 grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <Card title="要対応" count={todos.length}>
              {todos.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">対応が必要な契約者はいません。</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {todos.map((t, i) => {
                    const Icon = TODO_ICON[t.kind]
                    const urgent = t.kind === 'no_record' || t.kind === 'stalled'
                    return (
                      <li key={`${t.linkId}-${t.kind}-${i}`}>
                        <Link href={`/trainer?id=${t.linkId}`} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950">
                          <Icon className={`w-4 h-4 shrink-0 ${urgent ? 'text-red-500' : 'text-zinc-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-black dark:text-white truncate">{t.name}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.message}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-zinc-300 dark:text-zinc-700" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="今週の実施状況">
              {week.people.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">進行中のプランがある契約者はいません。</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-bold tabular-nums text-black dark:text-white">
                      {week.pct ?? 0}<span className="ml-0.5 text-base font-semibold text-zinc-500">%</span>
                    </p>
                    <p className="pb-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {week.people.length}人の合計 {week.done} / {week.total} 種目{week.skipped > 0 && ` · スキップ ${week.skipped}`}
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {week.people.map(p => (
                      <li key={p.linkId}>
                        <Link href={`/trainer?id=${p.linkId}`} className="block space-y-1 -mx-2 px-2 py-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-black dark:text-white truncate">{p.name}</p>
                            <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                              {p.week != null && `Week ${p.week} · `}{p.done} / {p.total} 種目{p.skipped > 0 && ` · スキップ ${p.skipped}`}
                            </p>
                          </div>
                          <ProgressBar done={p.done} total={p.total} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="成果のハイライト" note={`直近${HIGHLIGHT_DAYS / 7}週間で推定1RMを更新した種目`}>
              {highlights.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">直近{HIGHLIGHT_DAYS / 7}週間で推定1RMを更新した種目はまだありません。</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {highlights.map(h => (
                    <li key={`${h.linkId}-${h.exercise}`}>
                      <Link href={`/trainer?id=${h.linkId}`} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950">
                        <TrendingUp className="w-4 h-4 shrink-0 text-zinc-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-black dark:text-white truncate"><span className="font-semibold">{h.name}</span> · {h.exercise}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{h.beforeKg}kg → {h.recentKg}kg（{fmtDay(h.trainedOn)}）</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-black dark:text-white">+{h.gainKg}kg</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="最近の記録">
              {recent.length === 0 ? (
                <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">まだ記録がありません。</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {recent.map(s => (
                    <li key={s.id}>
                      <Link href={`/trainer?id=${s.linkId}`} className="block py-3 -mx-2 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold text-black dark:text-white truncate">{s.name}</p>
                          <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{fmtDay(s.trainedOn)}</p>
                        </div>
                        {s.exercises.map((e, i) => (
                          <p key={i} className="text-xs text-zinc-600 dark:text-zinc-300">
                            <span className="text-black dark:text-white">{e.name}</span>
                            {e.sets && <span className="ml-1.5 text-zinc-500 dark:text-zinc-400 tabular-nums">{e.sets}</span>}
                          </p>
                        ))}
                        {s.memo && <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{s.memo}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, count, note, children }: { title: string; count?: number; note?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 md:px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h2>
        {count != null && count > 0 && <span className="text-xs font-semibold tabular-nums text-red-500">{count}</span>}
        {note && <span className="text-[11px] text-zinc-400">{note}</span>}
      </div>
      {children}
    </section>
  )
}
