import type { WeekPhaseCode } from './week_phases'

// 週のフェーズの名前と色。セルフモードのプログラムタブ（CoachingClient）と、
// トレーナーのプランのプログラムタブ（CoachingPlanView）で同じものを使う
export const PHASE_STYLE: Record<WeekPhaseCode, { name: string; short: string; badge: string; bar: string; dot: string }> = {
  V: { name: 'Volume Phase', short: 'Vol', badge: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  I: { name: 'Intensity Phase', short: 'Int', badge: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  D: { name: 'Deload Week', short: 'Dld', badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  M: { name: 'MaxOut Week', short: 'Max', badge: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400', bar: 'bg-red-500', dot: 'bg-red-500' },
}
