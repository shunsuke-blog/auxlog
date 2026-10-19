'use client'

import type { GrowthReport, OneRmGain } from '@/lib/program/week9-report'

type Props = {
  report: GrowthReport
  isRenewing: boolean
  renewError: string | null
  onRenew: () => void
  onDismiss: () => void
  /** 文言の差し替え（コーチングモードのプラン完了時に使う）。省略時はセルフモードの9週間の文言 */
  copy?: GrowthReportCopy
}

export type GrowthReportCopy = {
  /** 「9週間」「6週間」など */
  period: string
  message: string
  action: string
  actionBusy: string
}

const SELF_MODE_COPY: GrowthReportCopy = {
  period: '9週間',
  message: '9週間、記録を続けたこと自体がいちばんの積み重ねです。今週の実績をもとに重量の基準を自動で更新して、次の9週間プログラムを作成します。種目の選び直しは不要で、これまでの記録もそのまま残ります。',
  action: '次の9週間を始める',
  actionBusy: '作成中...',
}

// LP(auxlog-lp01)のCTAボタンと同じアクセントカラー。ライム背景+黒文字の固定コントラストでのみ使う
// （モバイル版 growth-report-modal.tsx と同じ値）。
const ACCENT = '#E8FF00'

function formatDateJP(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatKg(kg: number): string {
  return `${Math.round(kg).toLocaleString('ja-JP')}kg`
}

type GainDisplay =
  | { kind: 'grown'; label: string; diff: number }
  | { kind: 'stable'; label: string }
  | { kind: 'new'; label: string }

// 1RM推定は丸め誤差で微増するだけのケースもあるため、意味のある伸び(1kg以上)だけを
// 「伸びた」として褒める。変化なし・微減は「安定して扱えている」と言い換える。
function describeGain(gain: OneRmGain): GainDisplay {
  if (gain.old_one_rm_kg == null) {
    return { kind: 'new', label: `${gain.exercise_name}は基準が ${formatKg(gain.new_one_rm_kg)} になりました` }
  }
  const diff = gain.new_one_rm_kg - gain.old_one_rm_kg
  if (diff >= 1) {
    return { kind: 'grown', label: `${gain.exercise_name}は ${formatKg(gain.old_one_rm_kg)} → ${formatKg(gain.new_one_rm_kg)}`, diff }
  }
  return { kind: 'stable', label: `${gain.exercise_name}は ${formatKg(gain.new_one_rm_kg)} を安定して扱えています` }
}

// 一番伸びた1種目だけを「ヒーロー数値」として大きく見せ、他は下の一覧に全部残す。
function bestGrown(report: GrowthReport): { gain: OneRmGain; oldKg: number; diff: number; pct: number } | null {
  let best: { gain: OneRmGain; oldKg: number; diff: number; pct: number } | null = null
  for (const gain of report.one_rm_gains) {
    if (gain.old_one_rm_kg == null) continue
    const diff = gain.new_one_rm_kg - gain.old_one_rm_kg
    if (diff < 1) continue
    if (!best || diff > best.diff) {
      best = { gain, oldKg: gain.old_one_rm_kg, diff, pct: Math.round((diff / gain.old_one_rm_kg) * 100) }
    }
  }
  return best
}

function fallbackHeadline(report: GrowthReport, period: string): string {
  if (report.total_sessions > 0) return `${period}、${report.total_sessions}回のトレーニングをやり切りました。`
  return `${period}、お疲れ様でした。`
}

// Week9(MaxOut)の全種目記録が完了した直後に表示する成長レポート。成果を先に見せてから
// 「次のサイクルを始めるか」を選んでもらう（モバイル版 growth-report-modal.tsx の移植）。
export default function GrowthReportModal({ report, isRenewing, renewError, onRenew, onDismiss, copy = SELF_MODE_COPY }: Props) {
  const best = bestGrown(report)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60" onClick={isRenewing ? undefined : onDismiss} />
      <div className="relative w-full max-w-sm max-h-[80vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-2xl p-6 gap-4">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center">
          {formatDateJP(report.cycle_started_at)} 〜 {formatDateJP(report.cycle_completed_at)} の成果
        </p>

        {best ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">一番伸びたのは</p>
            <p className="px-4 py-2 my-1 rounded-2xl text-[40px] leading-[44px] font-extrabold text-black" style={{ backgroundColor: ACCENT }}>
              +{formatKg(best.diff)}
            </p>
            <p className="text-base font-bold text-black dark:text-white">{best.gain.exercise_name}</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              {formatKg(best.oldKg)} → {formatKg(best.gain.new_one_rm_kg)}（+{best.pct}%）
            </p>
          </div>
        ) : (
          <p className="text-lg font-bold text-center text-black dark:text-white leading-relaxed">{fallbackHeadline(report, copy.period)}</p>
        )}

        <div className="overflow-y-auto">
          <div className="flex py-3 mb-3 border-y border-zinc-100 dark:border-zinc-900">
            <div className="flex-1 flex flex-col items-center gap-1">
              <p className="text-[28px] leading-8 font-semibold text-black dark:text-white">{report.total_sessions}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">回のトレーニング</p>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1">
              <p className="text-[28px] leading-8 font-semibold text-black dark:text-white">{formatKg(report.total_volume_kg)}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">総重量（{copy.period}の合計）</p>
            </div>
          </div>

          {report.one_rm_gains.length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-sm font-semibold text-black dark:text-white mb-1">種目別の変化</p>
              {report.one_rm_gains.map(gain => {
                const display = describeGain(gain)
                return (
                  <div key={gain.slot_id} className="flex items-center justify-between gap-2">
                    <p className="flex-1 text-[13px] leading-5 text-black dark:text-white">{display.label}</p>
                    {display.kind === 'grown' && (
                      <span className="px-2 py-0.5 rounded-full text-[12px] font-bold text-black" style={{ backgroundColor: ACCENT }}>
                        +{formatKg(display.diff)}
                      </span>
                    )}
                    {display.kind === 'stable' && (
                      <span className="px-2 py-0.5 rounded-full text-[12px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-900">±0kg</span>
                    )}
                    {display.kind === 'new' && (
                      <span className="px-2 py-0.5 rounded-full text-[12px] font-bold text-zinc-500 border border-zinc-200 dark:border-zinc-800">NEW</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center leading-5">
            {copy.message}
          </p>
        </div>

        {renewError && <p className="text-[12px] text-red-500 text-center">{renewError}</p>}

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            disabled={isRenewing}
            className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white disabled:opacity-40"
          >
            あとで
          </button>
          <button
            onClick={onRenew}
            disabled={isRenewing}
            className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-sm font-bold text-white dark:text-black disabled:opacity-40"
          >
            {isRenewing ? copy.actionBusy : copy.action}
          </button>
        </div>
      </div>
    </div>
  )
}
