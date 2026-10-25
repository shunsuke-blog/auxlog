'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import GrowthReportModal from '@/components/home/GrowthReportModal'
import type { GrowthReport } from '@/lib/program/week9-report'
import { condenseTargetSets, isWeekComplete, type CoachingDay, type CoachingExercise, type LivePlan } from '@/lib/coaching/trainee'
import { weekPurpose } from '@/lib/coaching/week_phases'

type Props = {
  plan: LivePlan
  trainerName: string
  days: CoachingDay[]
  initialDay?: number
}

// コーチングモードのホーム。トレーナーが作ったプランの今週の Day ごとの種目を表示し、
// 種目をタップすると記録画面へ。セルフモードと同じく、今週の全種目が済んだら「次の週へ」を出す。
export default function CoachingHome({ plan, trainerName, days, initialDay }: Props) {
  const router = useRouter()
  // 指定が無ければ未完了の種目がある最初の Day を開く。記録画面から戻った時は ?day= で前の Day に戻す
  const [selectedDay, setSelectedDay] = useState(() =>
    days.some(d => d.dayNumber === initialDay)
      ? initialDay!
      : (days.find(d => d.exercises.some(e => !e.recorded && !e.skipped)) ?? days[0])?.dayNumber ?? 1,
  )
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [report, setReport] = useState<GrowthReport | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const day = days.find(d => d.dayNumber === selectedDay) ?? days[0]
  const weekComplete = isWeekComplete(days)
  const isFinalWeek = plan.currentWeek >= plan.totalWeeks

  const selectDay = (n: number) => {
    setSelectedDay(n)
    window.history.replaceState(null, '', `/?day=${n}`)
  }

  const advanceWeek = async () => {
    setAdvancing(true)
    setError(null)
    try {
      const res = await fetch('/api/coaching-plan/advance-week', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '週の更新に失敗しました')
      selectDay(1)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '週の更新に失敗しました')
    } finally {
      setAdvancing(false)
    }
  }

  // 最終週の全種目が済んだら、成長レポートを見せてからプランを完了する（セルフモードの Week9 と同じ順序）
  const showReport = async () => {
    setLoadingReport(true)
    setError(null)
    try {
      const res = await fetch('/api/coaching-plan/growth-report')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '成長レポートの取得に失敗しました')
      setFinishError(null)
      setReport((data as { growth_report: GrowthReport }).growth_report)
    } catch (e) {
      setError(e instanceof Error ? e.message : '成長レポートの取得に失敗しました')
    } finally {
      setLoadingReport(false)
    }
  }

  const finishPlan = async () => {
    setFinishing(true)
    setFinishError(null)
    try {
      const res = await fetch('/api/coaching-plan/finish', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'プランの完了に失敗しました')
      setReport(null)
      router.refresh()
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : 'プランの完了に失敗しました')
    } finally {
      setFinishing(false)
    }
  }

  const toggleSkip = async (ex: CoachingExercise) => {
    setBusyId(ex.planExerciseId)
    setError(null)
    try {
      const res = await fetch(`/api/coaching-plan/exercises/${ex.planExerciseId}/skip`, { method: ex.skipped ? 'DELETE' : 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'スキップに失敗しました')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'スキップに失敗しました')
    } finally {
      setBusyId(null)
    }
  }

  const purpose = weekPurpose(plan.weekPhases, plan.currentWeek)
  // 今週の日付（開始日＋(週−1)×7日 〜 ＋6日）。セルフモードのホームと同じ書き方
  const weekRange = (() => {
    if (!plan.startDate) return null
    const DOW = ['日', '月', '火', '水', '木', '金', '土']
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`
    const start = new Date(`${plan.startDate}T00:00:00`)
    start.setDate(start.getDate() + (plan.currentWeek - 1) * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${fmt(start)} 〜 ${fmt(end)}`
  })()

  return (
    <>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide">{trainerName} さんのプラン</p>
        <div className="flex items-end justify-between mt-0.5 gap-3">
          <h1 className="text-xl font-black text-black dark:text-white tracking-tight leading-tight truncate">{plan.name}</h1>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              Week {plan.currentWeek} / {plan.totalWeeks}
            </p>
            {weekRange && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{weekRange}</p>}
          </div>
        </div>
      </div>

      {/* 今週の目的（なぜ今週は回数が多いのか・軽いのか）。フェーズの無いプラン（白紙から作成）は出さない */}
      {purpose && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">今週の目的</p>
          <p className="text-sm font-semibold text-black dark:text-white">{purpose.label}</p>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{purpose.message}</p>
        </div>
      )}

      {days.length > 1 && (
        <div className="flex gap-2 px-5 pt-5 pb-2 overflow-x-auto scrollbar-none">
          {days.map(d => {
            const isActive = d.dayNumber === day?.dayNumber
            const done = d.exercises.length > 0 && d.exercises.every(e => e.recorded || e.skipped)
            return (
              <button
                key={d.dayNumber}
                onClick={() => selectDay(d.dayNumber)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                Day {d.dayNumber}{done ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
      )}

      {weekComplete && !isFinalWeek && (
        <div className="px-5 pt-3">
          <button
            onClick={advanceWeek}
            disabled={advancing}
            className="w-full py-4 rounded-3xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-50 transition-opacity"
          >
            {advancing ? '更新中...' : `Week ${plan.currentWeek} 完了 → Week ${plan.currentWeek + 1} へ`}
          </button>
        </div>
      )}

      {weekComplete && isFinalWeek && (
        <div className="mx-5 mt-3 px-5 py-4 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
          <p className="text-sm font-semibold text-black dark:text-white">プランの全メニューが終わりました 🎉</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{plan.totalWeeks}週間の成果を確認して、プランを完了しましょう。</p>
          <button
            onClick={showReport}
            disabled={loadingReport}
            className="mt-3 w-full py-3 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-50"
          >
            {loadingReport ? '集計中...' : '成果を見る'}
          </button>
        </div>
      )}

      {error && <p className="px-6 pt-3 text-sm text-red-500">{error}</p>}

      <div className="px-5 py-4 space-y-3">
        {day?.label && <p className="px-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{day.label}</p>}
        {!day || day.exercises.length === 0 ? (
          <p className="px-1 py-10 text-center text-sm text-zinc-400">この日のメニューはありません</p>
        ) : (
          day.exercises.map(ex => (
            <ExerciseCard
              key={ex.planExerciseId}
              ex={ex}
              busy={busyId === ex.planExerciseId}
              onToggleSkip={() => toggleSkip(ex)}
            />
          ))
        )}
      </div>

      {report && (
        <GrowthReportModal
          report={report}
          isRenewing={finishing}
          renewError={finishError}
          onRenew={finishPlan}
          onDismiss={() => setReport(null)}
          copy={{
            period: `${plan.totalWeeks}週間`,
            message: `${plan.totalWeeks}週間、記録を続けたこと自体がいちばんの積み重ねです。プランを完了すると、${trainerName} さんが次のプランを共有するまでホームでお待ちいただく形になります。これまでの記録はそのまま残ります。`,
            action: 'プランを完了する',
            actionBusy: '完了中...',
          }}
        />
      )}
    </>
  )
}

function ExerciseCard({ ex, busy, onToggleSkip }: { ex: CoachingExercise; busy: boolean; onToggleSkip: () => void }) {
  const dimmed = ex.recorded || ex.skipped

  return (
    <div
      className={`rounded-3xl ${
        dimmed
          ? 'bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800/50'
          : 'bg-white dark:bg-zinc-900 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-none border border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <Link href={`/coaching-plan/record/${ex.planExerciseId}`} className="block px-5 pt-4 pb-4 active:scale-[0.99] transition-transform">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {ex.recorded && <p className="text-[11px] text-zinc-400 font-medium mb-0.5">記録済み</p>}
            {ex.skipped && <p className="text-[11px] text-zinc-400 font-medium mb-0.5">スキップ</p>}
            <h3 className={`text-[15px] font-bold leading-snug ${dimmed ? 'text-zinc-400 dark:text-zinc-500' : 'text-black dark:text-white'}`}>
              {ex.name}
            </h3>
          </div>
          {ex.recorded
            ? <CheckCircle2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mt-1 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 mt-1 shrink-0" />}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

        {/* アプリと同じく、同じ重量・回数のセットはまとめる（メイン ＋ 3セット）。RIR は出さない */}
        <div className="space-y-1.5">
          {condenseTargetSets(ex).map((row, i) => {
            const warm = row.label === 'ウォーム'
            return (
              <div key={i} className="flex items-start gap-2 text-[13px]">
                <span className={`w-14 shrink-0 text-[11px] font-semibold tracking-wide ${warm || dimmed ? 'text-zinc-400' : row.label === 'メイン' ? 'text-black dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {row.label}
                </span>
                <span className={`tabular-nums ${warm || dimmed ? 'text-zinc-400' : 'font-medium text-black dark:text-white'}`}>{row.text}</span>
              </div>
            )
          })}
        </div>

        {ex.note && (
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl px-3 py-2 whitespace-pre-wrap">
            {ex.note}
          </p>
        )}
      </Link>

      {!ex.recorded && (
        <div className="px-5 pb-4 -mt-1 flex justify-end">
          <button
            onClick={onToggleSkip}
            disabled={busy}
            className="text-xs font-semibold text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-40"
          >
            {busy ? '...' : ex.skipped ? 'スキップを取り消す' : '今回はスキップ'}
          </button>
        </div>
      )}
    </div>
  )
}
