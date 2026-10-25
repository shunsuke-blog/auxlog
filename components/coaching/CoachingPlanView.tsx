'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { PRIORITY_MUSCLE_OPTION_LABELS, type PriorityMuscleOption } from '@/types'
import type { LivePlan, PlanOverview } from '@/lib/coaching/trainee'
import { WEEK_PHASE_MESSAGES, type WeekPhaseCode } from '@/lib/coaching/week_phases'

const WeightProgressChart = dynamic(() => import('@/app/(app)/coaching/WeightProgressChart'), { ssr: false })

const PHASE_STYLE: Record<WeekPhaseCode, { name: string; short: string; badge: string; bar: string; dot: string }> = {
  V: { name: 'Volume Phase', short: 'Vol', badge: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  I: { name: 'Intensity Phase', short: 'Int', badge: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  D: { name: 'Deload Week', short: 'Dld', badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  M: { name: 'MaxOut Week', short: 'Max', badge: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400', bar: 'bg-red-500', dot: 'bg-red-500' },
}

const SESSION_LABEL: Record<number, string> = { 60: '〜60分', 75: '60〜90分', 90: '90分〜' }

type Props = { plan: LivePlan; trainerName: string; overview: PlanOverview }

// トレーナーのプランを使っているトレーニーのプログラムタブ（閲覧のみ、2026-10-25）。
// アプリのプログラムタブと同じく「プログラム情報」「種目情報」を切り替えて見る。種目・セットの変更は
// トレーナーが行うので、ここでは編集できない。
export default function CoachingPlanView({ plan, trainerName, overview }: Props) {
  const [view, setView] = useState<'program' | 'exercises'>('program')
  const phases = (plan.weekPhases ?? []).filter((p): p is WeekPhaseCode => p in PHASE_STYLE)
  const phase = phases[plan.currentWeek - 1] ?? null
  const style = phase ? PHASE_STYLE[phase] : null
  const progressPct = Math.round((plan.currentWeek / plan.totalWeeks) * 100)
  const startLabel = plan.startDate
    ? new Date(`${plan.startDate}T00:00:00`).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 z-20">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-black dark:text-white">プログラム</h1>
        </div>
        <div className="px-6 pb-3">
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
            {([['program', 'プログラム情報'], ['exercises', '種目情報']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  view === v ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        {view === 'program' ? (
          <>
            <div className="px-5 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <p className="text-xs text-zinc-400 mb-1">{trainerName} さんのプラン</p>
              <h2 className="text-base font-bold text-black dark:text-white mb-4">{plan.name}</h2>

              {style && (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-5 ${style.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot} ${phase === 'M' ? 'animate-pulse' : ''}`} />
                  {style.name}
                </div>
              )}

              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-black dark:text-white">Week {plan.currentWeek} / {plan.totalWeeks}</span>
                  <span className="text-xs text-zinc-400">{progressPct}%</span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${style?.bar ?? 'bg-zinc-400'}`} style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Stat label="頻度" value={`週${overview.daysPerWeek}回`} />
                {overview.sessionMinutes && <Stat label="セッション" value={SESSION_LABEL[overview.sessionMinutes]} />}
                {startLabel && <Stat label="開始日" value={startLabel} />}
                <Stat
                  label="重点部位"
                  value={overview.priorityMuscles.length > 0
                    ? overview.priorityMuscles.map(m => PRIORITY_MUSCLE_OPTION_LABELS[m as PriorityMuscleOption] ?? m).join('・')
                    : 'なし'}
                />
              </div>
            </div>

            {phases.length === plan.totalWeeks && (
              <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">{plan.totalWeeks}週間の流れ</p>
                <div className="flex gap-1">
                  {phases.map((p, i) => {
                    const week = i + 1
                    const current = week === plan.currentWeek
                    return (
                      <div key={week} className="flex-1 min-w-0 text-center space-y-1">
                        <div className={`h-1.5 rounded-full ${week <= plan.currentWeek ? PHASE_STYLE[p].bar : 'bg-zinc-100 dark:bg-zinc-800'}`} />
                        <p className={`text-[10px] ${current ? 'font-bold text-black dark:text-white' : 'text-zinc-400'}`}>W{week}</p>
                        <p className="text-[9px] text-zinc-400 truncate">{PHASE_STYLE[p].short}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {phase && (
              <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">今週の目的</p>
                <p className="text-sm font-semibold text-black dark:text-white">{WEEK_PHASE_MESSAGES[phase].label}</p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{WEEK_PHASE_MESSAGES[phase].message}</p>
              </div>
            )}

            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">使用重量の推移</p>
              <p className="text-xs text-zinc-400 mb-3">このプランで記録した、週ごとの最大重量です。</p>
              <WeightProgressChart exercises={overview.weightHistory} currentWeek={plan.currentWeek} />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Week {plan.currentWeek} の種目です。種目やセットはトレーナーが決めます。変更したい時は {trainerName} さんに相談してください。
            </p>
            {overview.days.map(d => (
              <div key={d.dayNumber} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                <p className="text-xs font-semibold text-zinc-400 mb-2">Day {d.dayNumber}{d.label ? `　${d.label}` : ''}</p>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {d.exercises.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                      <p className="text-sm text-black dark:text-white truncate">{e.name}</p>
                      {e.oneRmKg != null && <p className="shrink-0 text-xs font-semibold text-zinc-500">1RM {e.oneRmKg}kg</p>}
                    </div>
                  ))}
                  {d.exercises.length === 0 && <p className="py-2.5 text-sm text-zinc-400">この日のメニューはありません</p>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-black dark:text-white">{value}</p>
    </div>
  )
}
