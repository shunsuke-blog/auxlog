import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import type { TraineeRow } from '@/lib/trainer/trainees'
import { formatMonthDay, todayInJapan } from '@/lib/coaching/week_dates'

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
    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
      {/* 進んでいる分はアクセントカラー（「追加」ボタンと同じ #0B7A75、2026-10-25 オーナー指定） */}
      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  )
}

// href: チームの管理者がメンバーのクライアントを見る時は、チーム画面の中で詳細を開く（2026-10-26）
// 2026-10-30 一覧を整理（オーナー依頼「使いやすさ・見やすさ重視」）:
// - アラートはアイコンのマウスオーバーだけでなく、内容をその場に出す（スマホでは見えなかった）
// - 状態のラベルは「契約中」以外の時だけ出す（ほぼ全員が契約中で、情報にならない）
// - 契約終了は行ごと半透明にせず、ラベルで示す（薄い文字がさらに薄くなっていた）
// 2026-11-09 さらに2行にまとめる（オーナー決定: プラン名は詳細で見られるので一覧から外す）:
// - 1行目: 名前・状態・アラート（赤い字で短く）
// - 2行目: Week・今週の進み具合のバー・最終記録日（招待中は招待リンクの状態）
export default function TraineeListItem({ row, selected, href }: { row: TraineeRow; selected: boolean; href?: string }) {
  const startsLater = row.plan?.startDate && row.plan.startDate > todayInJapan() ? row.plan.startDate : null
  const showProgress = row.progress && row.status !== 'ended'
  return (
    <Link
      href={href ?? `/trainer?id=${row.linkId}`}
      className={`block px-4 py-3 rounded-2xl transition-colors ${
        selected ? 'border border-brand bg-brand-soft' : 'trainer-card hover:bg-zinc-50 dark:hover:bg-zinc-950'
      }`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className="shrink-0 max-w-[60%] text-sm font-semibold text-black dark:text-white truncate">{row.name}</p>
          {row.status !== 'active' && (
            <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
              {STATUS_LABELS[row.status]}
            </span>
          )}
          {row.alerts.length > 0 && (
            <span className="min-w-0 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400" title={row.alerts.map(a => a.message).join('\n')}>
              <CircleAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{row.alerts[0].message}{row.alerts.length > 1 && ` ほか${row.alerts.length - 1}件`}</span>
            </span>
          )}
        </div>
        {row.status === 'invited' ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {row.invite
              ? row.invite.expired ? '招待リンクの期限切れ（作り直してください）' : `招待リンク送付済み（${fmtDay(row.invite.expiresAt)}まで）`
              : '招待リンクなし（作ってください）'}
          </p>
        ) : (
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {showProgress ? (
              <>
                <span className="shrink-0">{startsLater ? `${formatMonthDay(startsLater)} 開始予定` : `Week ${row.plan?.currentWeek}`}</span>
                <div className="flex-1 min-w-0"><ProgressBar done={row.progress!.done} total={row.progress!.total} /></div>
                <span className="shrink-0">{row.progress!.done}/{row.progress!.total}</span>
              </>
            ) : (
              <span className="flex-1">{row.plan ? '' : 'プランなし'}</span>
            )}
            <span className="shrink-0">最終 {row.lastTrainedOn ? fmtDay(row.lastTrainedOn) : 'なし'}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
