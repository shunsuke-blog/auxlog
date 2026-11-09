import Link from 'next/link'
import { ArrowLeftRight, ChevronDown, CircleAlert } from 'lucide-react'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { createClient } from '@/lib/supabase/server'
import { loadTraineeDetail, type TraineeRow } from '@/lib/trainer/trainees'
import { ProgressBar, STATUS_LABELS } from './TraineeListItem'
import DetailHeader, { LoginLinkCard } from './DetailActions'
import TraineeNameEditor from './TraineeNameEditor'
import SelfPlanActions from './SelfPlanActions'
import type { TemplateOption } from './TemplateOneRmFields'
import { formatMonthDay, todayInJapan, weekDateRange } from '@/lib/coaching/week_dates'
import { loadCoachingWeek } from '@/lib/coaching/trainee'
import ClientRecords from './ClientRecords'
import { DetailTabs, TabPanel, type DetailTab } from './DetailTabs'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/')

// トレーニーの詳細（2026-11-09 オーナーと整理）:
// - 上には開いてすぐ「今どうなっているか」がわかる分だけを常に出す（名前・アラート・プラン・今の週と進み具合・最終記録）
// - 下はタブ（今週・記録・1RM と自己ベスト）。たまにしか使わない操作（ログイン用のリンク・担当替え・契約の終了）は名前の横の「･･･」
// - 招待中は招待リンクが今やることなので、タブを出さずに招待リンクを出す
// 自分の行（isSelf）は契約の表示・名前の変更・契約の終了の代わりに、自分のトレーニー画面を開くボタンと
// 自分に割り当てるプログラムの変更を出す（2026-10-26）。
// readOnly: チームの管理者がメンバーのクライアントを見る時（名前の変更・招待・契約の終了は出さない。記録は直せる）。
// reassign: チームの管理者には担当替えを出す（2026-10-26）
export default async function TraineeDetailPanel({ row, templates, selfName, readOnly = false, reassign }: {
  row: TraineeRow
  templates: TemplateOption[]
  selfName: string
  readOnly?: boolean
  reassign?: { currentTrainerId: string; trainers: { id: string; name: string }[] }
}) {
  const supabase = await createClient()
  const detail = row.traineeId && row.status !== 'invited' ? await loadTraineeDetail(supabase, row.traineeId) : null
  // 記録を直す・代わりに入力するのは契約中のクライアントだけ（自分の記録は自分のトレーニー画面から。2026-10-29）
  const editable = !row.isSelf && row.status === 'active'
  const livePlan = editable && row.plan && (row.plan.status === 'shared' || row.plan.status === 'active') ? row.plan : null
  const week = livePlan ? { weekNumber: livePlan.currentWeek, days: await loadCoachingWeek(supabase, livePlan.id, livePlan.currentWeek) } : null
  const hasBests = !!detail && (detail.oneRms.length > 0 || detail.bests.length > 0)
  // プランのタブ: 今の週から後の Day と種目（2026-11-09 プランの途中変更）
  const planWeeks = livePlan ? await loadPlanOutline(supabase, livePlan.id, livePlan.currentWeek) : null

  const tabs: DetailTab[] = [
    ...(week ? [{ key: 'week' as const, label: '今週' }] : []),
    { key: 'records', label: '記録' },
    ...(planWeeks ? [{ key: 'plan' as const, label: 'プラン' }] : []),
    ...(hasBests ? [{ key: 'bests' as const, label: '1RM・自己ベスト' }] : []),
  ]
  const plan = row.plan && !(row.isSelf && row.plan.status === 'ended') ? row.plan : null

  const title = row.isSelf ? (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-black dark:text-white">{selfName}（自分）</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {row.plan && row.plan.status !== 'ended' ? '割り当てたプログラムで記録しています' : 'セルフモード（自動で作るプログラム）で記録しています'}
      </p>
    </div>
  ) : (
    <div className="space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        {readOnly
          ? <h2 className="text-xl font-semibold text-black dark:text-white truncate">{row.name}</h2>
          : <TraineeNameEditor key={row.name} linkId={row.linkId} name={row.name} />}
        {/* 状態のラベルは「契約中」以外の時だけ（一覧と同じ） */}
        {row.status !== 'active' && <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">{STATUS_LABELS[row.status]}</span>}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {row.startedAt ? `契約期間 ${fmtDate(row.startedAt)} 〜 ${row.endedAt ? fmtDate(row.endedAt) : ''}` : 'まだ招待リンクが開かれていません'}
      </p>
    </div>
  )

  return (
    // PC の広い画面でカードが横に伸びすぎないよう、幅に上限を付ける（2026-10-30）
    <div className="max-w-4xl px-4 md:px-6 py-4 md:py-6 space-y-5">
      {row.isSelf
        ? title
        : <DetailHeader linkId={row.linkId} name={row.name} status={row.status} invite={row.invite} reassign={reassign} readOnly={readOnly}>{title}</DetailHeader>}

      {row.alerts.length > 0 && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 space-y-1">
          {row.alerts.map(a => (
            <p key={a.kind} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <CircleAlert className="w-4 h-4 shrink-0" />
              {a.message}
            </p>
          ))}
        </div>
      )}

      {/* プランと今の週（常に出す） */}
      {plan && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-black dark:text-white">{plan.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              Week {plan.currentWeek} / {plan.totalWeeks}
              {plan.status === 'shared' && '（まだ記録が始まっていません）'}
              {plan.status === 'ended' && '（終了）'}
            </p>
            {/* プランの開始日はクライアントが受け取った時に決まる（契約期間とは別、2026-10-25） */}
            {plan.startDate && plan.status !== 'ended' && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {plan.startDate > todayInJapan() ? `${formatMonthDay(plan.startDate)} 開始予定` : weekDateRange(plan.startDate, plan.currentWeek)}
              </p>
            )}
          </div>
          {row.progress && row.status !== 'ended' && (
            <div className="flex items-center gap-3">
              <div className="flex-1"><ProgressBar done={row.progress.done} total={row.progress.total} /></div>
              <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                今週 {row.progress.done} / {row.progress.total} 種目{row.progress.skipped > 0 && `（スキップ ${row.progress.skipped}）`}
              </p>
            </div>
          )}
          {!row.isSelf && <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">最終記録 {row.lastTrainedOn ? fmtDay(row.lastTrainedOn) : 'なし'}</p>}
        </div>
      )}

      {row.isSelf && <SelfPlanActions templates={templates} hasPlan={!!row.plan && row.plan.status !== 'ended'} />}

      {/* 招待中: 招待リンクが今やること（タブは出さない） */}
      {row.status === 'invited' && !readOnly && <LoginLinkCard linkId={row.linkId} name={row.name} status={row.status} invite={row.invite} />}

      {detail && row.traineeId && (
        <DetailTabs key={row.linkId} tabs={tabs}>
          <ClientRecords
            // 別のクライアントに移ったら、入力の状態を持ち越さない
            key={row.traineeId}
            traineeId={row.traineeId}
            sessions={detail.sessions}
            week={week}
            editable={editable}
            title={row.isSelf ? '直近20回' : '契約期間内の直近20回'}
          />
          {planWeeks && livePlan && (
            <TabPanel name="plan">
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Week {livePlan.currentWeek} から後の種目の入れ替え・セットの変更ができます。記録した種目は変わりません。
                  </p>
                  <Link href={`/trainer/plans/${livePlan.id}`} className="shrink-0 self-end sm:self-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <ArrowLeftRight className="w-4 h-4" />
                    プランを変更する
                  </Link>
                </div>
                {/* 週ごとに開く。中は Day ごとの列に、種目を1行ずつ（読点でつなぐと折り返して読みにくかった、2026-11-09 オーナー指摘） */}
                {planWeeks.map(w => (
                  <details key={w.week} open={w.week === livePlan.currentWeek} className="group rounded-2xl trainer-card">
                    <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="text-sm font-semibold text-black dark:text-white">Week {w.week}</span>
                      {w.week === livePlan.currentWeek && <span className="text-xs text-zinc-500">今週</span>}
                      <ChevronDown className="ml-auto w-4 h-4 text-zinc-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-5 pb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {w.days.map(d => (
                        <div key={d.day} className="space-y-1.5">
                          <p className="text-xs font-semibold text-zinc-400">Day {d.day}</p>
                          {d.exercises.length === 0 ? (
                            <p className="text-sm text-zinc-400">種目なし</p>
                          ) : (
                            <ul className="space-y-1">
                              {d.exercises.map((e, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-sm">
                                  <span className="flex-1 min-w-0 text-black dark:text-white">{e.name}</span>
                                  {e.target && <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{e.target}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </TabPanel>
          )}
          {hasBests && (
            <TabPanel name="bests">
              <div className="grid md:grid-cols-2 gap-4">
                {detail.oneRms.length > 0 && (
                  <div className="px-5 py-4 rounded-2xl trainer-card space-y-2">
                    <p className="text-xs font-semibold text-zinc-400">1RM</p>
                    {detail.oneRms.map(o => (
                      <div key={o.label} className="flex justify-between text-sm">
                        <span className="text-black dark:text-white">{o.label}</span>
                        <span className="tabular-nums text-zinc-500">{o.oneRmKg}kg</span>
                      </div>
                    ))}
                  </div>
                )}
                {detail.bests.length > 0 && (
                  <div className="px-5 py-4 rounded-2xl trainer-card space-y-2">
                    <p className="text-xs font-semibold text-zinc-400">自己ベスト</p>
                    {/* 部位の順（胸 → 背中 → 肩 → 腕 → 脚 → 体幹）。件数は絞らずすべて出す */}
                    {detail.bests.map(b => (
                      <div key={b.name} className="flex items-baseline gap-2 text-sm">
                        <span className="w-7 shrink-0 text-[11px] text-zinc-400">{b.targetMuscle ? TARGET_MUSCLE_LABELS[b.targetMuscle] : ''}</span>
                        <span className="flex-1 min-w-0 text-black dark:text-white truncate pr-2">{b.name}</span>
                        <span className="tabular-nums text-zinc-500 shrink-0">{b.weightKg}kg × {b.reps}回</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabPanel>
          )}
        </DetailTabs>
      )}
    </div>
  )
}

type OutlineDay = {
  week_number: number
  day_number: number
  plan_exercises: {
    sort_order: number
    target_duration_seconds: number | null
    exercise_master: { name: string } | null
    trainer_exercises: { name: string } | null
    cardio_master: { name: string } | null
    plan_sets: { target_reps: number; is_warmup: boolean }[]
  }[]
}

// 種目の横に出す目標（ワーキングセットの数×回数、有酸素は分）。回数がセットで違えば幅で出す（5×5〜6）
function targetText(e: OutlineDay['plan_exercises'][number]): string {
  if (e.target_duration_seconds != null) return `${Math.round(e.target_duration_seconds / 60)}分`
  const working = e.plan_sets.filter(s => !s.is_warmup).map(s => s.target_reps)
  if (working.length === 0) return ''
  const lo = Math.min(...working)
  const hi = Math.max(...working)
  return `${working.length}×${lo === hi ? lo : `${lo}〜${hi}`}`
}

// プランのタブの一覧（今の週から後の週ごとの Day と種目名）
async function loadPlanOutline(supabase: Awaited<ReturnType<typeof createClient>>, planId: string, fromWeek: number) {
  const { data } = await supabase
    .from('plan_days')
    .select('week_number, day_number, plan_exercises(sort_order, target_duration_seconds, exercise_master(name), trainer_exercises(name), cardio_master(name), plan_sets(target_reps, is_warmup))')
    .eq('plan_id', planId)
    .gte('week_number', fromWeek)
    .order('week_number')
    .order('day_number')
  const weeks: { week: number; days: { day: number; exercises: { name: string; target: string }[] }[] }[] = []
  for (const d of (data ?? []) as unknown as OutlineDay[]) {
    let w = weeks.find(x => x.week === d.week_number)
    if (!w) { w = { week: d.week_number, days: [] }; weeks.push(w) }
    w.days.push({
      day: d.day_number,
      exercises: [...d.plan_exercises].sort((a, b) => a.sort_order - b.sort_order).map(e => ({
        name: e.exercise_master?.name ?? e.trainer_exercises?.name ?? e.cardio_master?.name ?? '種目',
        target: targetText(e),
      })),
    })
  }
  return weeks
}
