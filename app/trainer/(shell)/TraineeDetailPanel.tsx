import { CircleAlert } from 'lucide-react'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { createClient } from '@/lib/supabase/server'
import { loadTraineeDetail, type TraineeRow } from '@/lib/trainer/trainees'
import { ProgressBar, STATUS_LABELS } from './TraineeListItem'
import DetailActions from './DetailActions'
import TraineeNameEditor from './TraineeNameEditor'
import SelfPlanActions from './SelfPlanActions'
import type { TemplateOption } from './TemplateOneRmFields'
import { ReassignSelect } from './team/TeamActions'
import { formatMonthDay, todayInJapan, weekDateRange } from '@/lib/coaching/week_dates'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })

// トレーニーの詳細: 契約の状態とプラン、契約期間内の記録、（契約中のみ）自己ベストと1RM。
// 自分の行（isSelf）は契約の表示・名前の変更・契約の終了の代わりに、自分のトレーニー画面を開くボタンと
// 自分に割り当てるプログラムの変更を出す（2026-10-26）。
// readOnly: チームの管理者がメンバーのクライアントを見る時（名前の変更・招待・契約の終了は出さない）。
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

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-5">
      {row.isSelf ? (
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
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">{STATUS_LABELS[row.status]}</span>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {row.startedAt ? `契約期間 ${fmtDate(row.startedAt)} 〜 ${row.endedAt ? fmtDate(row.endedAt) : ''}` : 'まだ招待コードが入力されていません'}
        </p>
      </div>
      )}

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

      {row.plan && !(row.isSelf && row.plan.status === 'ended') && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-2">
          <p className="text-xs font-semibold text-zinc-400 ">プラン</p>
          <p className="text-sm font-semibold text-black dark:text-white">{row.plan.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Week {row.plan.currentWeek} / {row.plan.totalWeeks}
            {row.plan.status === 'shared' && '（まだ記録が始まっていません）'}
            {row.plan.status === 'ended' && '（終了）'}
          </p>
          {/* プランの開始日はトレーニーがコード入力時に選ぶ（契約期間とは別、2026-10-25） */}
          {row.plan.startDate && row.plan.status !== 'ended' && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {row.plan.startDate > todayInJapan() ? `${formatMonthDay(row.plan.startDate)} 開始予定` : `開始日 ${formatMonthDay(row.plan.startDate)}`}
              <span className="ml-3">Week {row.plan.currentWeek}：{weekDateRange(row.plan.startDate, row.plan.currentWeek)}</span>
            </p>
          )}
          {row.progress && row.status !== 'ended' && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                今週 {row.progress.done} / {row.progress.total} 種目{row.progress.skipped > 0 && `（スキップ ${row.progress.skipped}）`}
              </p>
              <ProgressBar done={row.progress.done} total={row.progress.total} />
            </div>
          )}
        </div>
      )}

      {row.isSelf
        ? <SelfPlanActions templates={templates} hasPlan={!!row.plan && row.plan.status !== 'ended'} />
        : !readOnly && <DetailActions linkId={row.linkId} status={row.status} invite={row.invite} />}

      {reassign && !row.isSelf && row.status !== 'ended' && reassign.trainers.length > 1 && (
        <ReassignSelect linkId={row.linkId} currentTrainerId={reassign.currentTrainerId} trainers={reassign.trainers} />
      )}

      {detail && (detail.oneRms.length > 0 || detail.bests.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {detail.oneRms.length > 0 && (
            <div className="px-5 py-4 rounded-2xl trainer-card space-y-2">
              <p className="text-xs font-semibold text-zinc-400 ">1RM</p>
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
              <p className="text-xs font-semibold text-zinc-400 ">自己ベスト</p>
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
      )}

      {detail && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400 ">{row.isSelf ? '記録（直近20回）' : '記録（契約期間内・直近20回）'}</p>
          {detail.sessions.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">まだ記録がありません。</p>
          ) : (
            detail.sessions.map(s => (
              <div key={s.id} className="px-5 py-4 rounded-2xl trainer-card space-y-2">
                <p className="text-sm font-semibold text-black dark:text-white">{fmtDate(s.trainedOn)}</p>
                {s.exercises.map((e, i) => (
                  <div key={i} className="text-sm">
                    <p className="text-black dark:text-white">
                      {e.name}
                      {/* トレーニーがホームの「種目を追加」から記録した、プランに無い種目 */}
                      {e.offPlan && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">プラン外</span>}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {e.cardio ?? e.sets.map(st => `${st.isWarmup ? 'W ' : ''}${st.weightKg}kg×${st.reps}`).join(' / ')}
                    </p>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
