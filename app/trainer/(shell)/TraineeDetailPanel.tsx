import { CircleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadTraineeDetail, type TraineeRow } from '@/lib/trainer/trainees'
import { ProgressBar, STATUS_LABELS } from './TraineeListItem'
import DetailActions from './DetailActions'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })

// トレーニーの詳細: 契約の状態とプラン、契約期間内の記録、（契約中のみ）自己ベストと1RM。
export default async function TraineeDetailPanel({ row }: { row: TraineeRow }) {
  const supabase = await createClient()
  const detail = row.traineeId && row.status !== 'invited' ? await loadTraineeDetail(supabase, row.traineeId) : null

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-black dark:text-white">{row.name}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">{STATUS_LABELS[row.status]}</span>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {row.startedAt ? `契約期間 ${fmtDate(row.startedAt)} 〜 ${row.endedAt ? fmtDate(row.endedAt) : ''}` : 'まだ招待コードが入力されていません'}
        </p>
      </div>

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

      {row.plan && (
        <div className="px-5 py-4 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">プラン</p>
          <p className="text-sm font-semibold text-black dark:text-white">{row.plan.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Week {row.plan.currentWeek} / {row.plan.totalWeeks}
            {row.plan.status === 'shared' && ' · まだ記録が始まっていません'}
            {row.plan.status === 'ended' && ' · 終了'}
          </p>
          {row.progress && row.status !== 'ended' && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                今週 {row.progress.done} / {row.progress.total} 種目{row.progress.skipped > 0 && ` · スキップ ${row.progress.skipped}`}
              </p>
              <ProgressBar done={row.progress.done} total={row.progress.total} />
            </div>
          )}
        </div>
      )}

      <DetailActions linkId={row.linkId} status={row.status} invite={row.invite} />

      {detail && (detail.oneRms.length > 0 || detail.bests.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {detail.oneRms.length > 0 && (
            <div className="px-5 py-4 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">1RM</p>
              {detail.oneRms.map(o => (
                <div key={o.label} className="flex justify-between text-sm">
                  <span className="text-black dark:text-white">{o.label}</span>
                  <span className="tabular-nums text-zinc-500">{o.oneRmKg}kg</span>
                </div>
              ))}
            </div>
          )}
          {detail.bests.length > 0 && (
            <div className="px-5 py-4 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">自己ベスト</p>
              {detail.bests.slice(0, 10).map(b => (
                <div key={b.name} className="flex justify-between text-sm">
                  <span className="text-black dark:text-white truncate pr-2">{b.name}</span>
                  <span className="tabular-nums text-zinc-500 shrink-0">{b.weightKg}kg × {b.reps}回</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">記録（契約期間内・直近20回）</p>
          {detail.sessions.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">まだ記録がありません。</p>
          ) : (
            detail.sessions.map(s => (
              <div key={s.id} className="px-5 py-4 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-2">
                <p className="text-sm font-semibold text-black dark:text-white">{fmtDate(s.trainedOn)}</p>
                {s.exercises.map((e, i) => (
                  <div key={i} className="text-sm">
                    <p className="text-black dark:text-white">{e.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {e.sets.map(st => `${st.isWarmup ? 'W ' : ''}${st.weightKg}kg×${st.reps}`).join(' / ')}
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
