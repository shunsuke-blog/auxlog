import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import type { TraineeRow } from '@/lib/trainer/trainees'

export const STATUS_LABELS: Record<TraineeRow['status'], string> = {
  invited: '招待中',
  active: '契約中',
  paused: '一時停止',
  ended: '契約終了',
}

const fmtDay = (iso: string) => iso.slice(5, 10).replace('-', '/')

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
      <div className="h-full rounded-full bg-zinc-500 dark:bg-zinc-400" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function TraineeListItem({ row, selected }: { row: TraineeRow; selected: boolean }) {
  const ended = row.status === 'ended'
  return (
    <Link
      href={`/trainer?id=${row.linkId}`}
      className={`block px-4 py-3.5 rounded-2xl border transition-colors ${
        selected ? 'border-brand bg-brand-soft' : 'border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-950'
      } ${ended ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-black dark:text-white truncate">{row.name}</p>
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
              {STATUS_LABELS[row.status]}
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
            {row.status === 'invited'
              ? row.invite
                ? row.invite.expired ? '招待コードの期限切れ（再発行してください）' : `招待コード ${row.invite.code} · ${fmtDay(row.invite.expiresAt)}まで`
                : '招待コードなし'
              : `${row.plan?.name ?? 'プランなし'} · 最終記録 ${row.lastTrainedOn ? fmtDay(row.lastTrainedOn) : 'なし'}`}
          </p>
          {row.progress && row.status !== 'ended' && (
            <div className="space-y-1">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                Week {row.plan?.currentWeek} · 今週 {row.progress.done} / {row.progress.total} 種目
                {row.progress.skipped > 0 && ` · スキップ ${row.progress.skipped}`}
              </p>
              <ProgressBar done={row.progress.done} total={row.progress.total} />
            </div>
          )}
        </div>
        {row.alerts.length > 0 && (
          <span title={row.alerts.map(a => a.message).join('\n')} className="shrink-0 mt-0.5 text-red-500">
            <CircleAlert className="w-5 h-5" />
          </span>
        )}
      </div>
    </Link>
  )
}
