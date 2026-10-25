import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadDashboard, type NamedLink } from '@/lib/trainer/dashboard_data'
import { formatActivityTime, HIGHLIGHT_DAYS, type TodoItem } from '@/lib/trainer/dashboard'
import AddTraineeButton, { type TemplateOption } from '../AddTraineeButton'

const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/').replace(/^0/, '')

// トレーナーのダッシュボード（2026-10-25、オーナーのデザイン案に合わせた）。ログインした時の最初の画面。
// 上: 数字のカード（契約中・今週完了した種目・1RM更新）。左: 最近のアクティビティ・成果のハイライト。
// 右: 今週の進捗・要対応 / アラート。スマホは縦に並べる。人の名前を押すと契約者一覧の詳細を開く。
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
  const byKind = (kind: TodoItem['kind']): NamedLink[] => todos.filter(t => t.kind === kind).map(t => ({ linkId: t.linkId, name: t.name }))

  return (
    <div className="min-h-dvh bg-zinc-50">
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
          <h2 className="text-base font-semibold text-black dark:text-white">クイック統計</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="契約中" value={`${data.activeCount}`} unit="名" />
            <Stat label="今週完了した種目" value={`${week.done} / ${week.total}`} />
            <Stat label="1RM更新" value={`${highlights.length}`} unit="件" note={`直近${HIGHLIGHT_DAYS / 7}週間`} />
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
                        <p className="shrink-0 text-sm font-bold tabular-nums text-brand-text">+{h.gainKg}kg</p>
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
                          <p className="text-base font-semibold text-black dark:text-white truncate">{p.name}</p>
                          <Link href={`/trainer?id=${p.linkId}`} className="shrink-0 text-xs font-semibold text-brand-text hover:underline">詳細を開く</Link>
                        </div>
                        <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <p className="text-xs text-zinc-600 tabular-nums">
                          {p.week != null && `Week ${p.week} | `}進行状況: {p.done} / {p.total} 種目 完了 ({pct}%){p.skipped > 0 && ` · スキップ ${p.skipped}`}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="要対応 / アラート">
              <dl className="space-y-3">
                <AlertRow label="7日以上記録がないメンバー" people={byKind('no_record')} urgent />
                <AlertRow label="推定1RMが3週間更新されていないメンバー" people={byKind('stalled')} urgent />
                <AlertRow label="次のプラン待ちのメンバー" people={byKind('waiting_plan')} />
                <AlertRow label="プランが最終週のメンバー" people={data.finalWeek} />
                <AlertRow label="1RM未入力のプラン" people={data.awaitingOneRm} suffix="（初回の記録から自動で推定します）" />
                <AlertRow label="招待コードの期限切れ" people={byKind('invite_expired')} />
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 md:px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-900 shadow-sm space-y-3">
      <h2 className="text-base font-semibold text-black dark:text-white">{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="px-3 md:px-4 py-3 md:py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-900 shadow-sm">
      <p className="text-xs md:text-sm text-zinc-600">
        {label}:{note && <span className="hidden md:inline text-zinc-400">（{note}）</span>}
      </p>
      <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-black dark:text-white">
        {value}{unit && <span className="ml-0.5 text-base md:text-lg">{unit}</span>}
      </p>
    </div>
  )
}

function AlertRow({ label, people, urgent, suffix }: { label: string; people: NamedLink[]; urgent?: boolean; suffix?: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-black dark:text-white">{label}:{people.length === 0 && <span className="ml-1 font-normal text-zinc-500">なし</span>}</dt>
      {people.length > 0 && (
        <dd className="mt-0.5 text-sm">
          {people.map((p, i) => (
            <span key={p.linkId}>
              {i > 0 && '、'}
              <Link href={`/trainer?id=${p.linkId}`} className={`hover:underline ${urgent ? 'text-red-600' : 'text-black dark:text-white'}`}>{p.name}</Link>
            </span>
          ))}
          {suffix && <span className="text-zinc-500">{suffix}</span>}
        </dd>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-zinc-500">{children}</p>
}
