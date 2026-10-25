// トレーニー一覧の「今週の進み具合」と「アラート」の判定（DBに依存しない純粋関数）。
// 決定事項（2026-10-19）:
//   - 進み具合: 今週のプランの種目のうち記録した種目数 / （種目数 − スキップ数）。スキップは別に表示
//   - アラート1: 契約中なのに最後の記録から7日以上（記録が無い場合は契約開始から7日以上）
//   - アラート2: 直近3週間、1RM管理種目の推定1RMがどれも更新されていない（それ以前の記録がある種目で判定）
// 日数は契約の開始日から数える。ただしプランの開始日（トレーニーがコード入力時に選ぶ）の方が後ならそこから数え、
// プランが始まる前はアラートを出さない（2026-10-25 オーナー決定）

import { estimateOneRm } from '@/lib/utils/epley'

export const NO_RECORD_ALERT_DAYS = 7
export const STALL_ALERT_DAYS = 21

export type WeekProgress = { done: number; total: number; skipped: number }

export function weekProgress(planExerciseIds: string[], recordedIds: ReadonlySet<string>, skippedIds: ReadonlySet<string>): WeekProgress {
  const skipped = planExerciseIds.filter(id => skippedIds.has(id) && !recordedIds.has(id)).length
  const done = planExerciseIds.filter(id => recordedIds.has(id)).length
  return { done, total: planExerciseIds.length - skipped, skipped }
}

export type OneRmSetSample = { exerciseKey: string; trainedOn: string; weightKg: number; reps: number }

// DB関数 trainer_trainee_activity の戻り値（lib/sql/review_followups_2026-10-25.sql）を、
// トレーニーごとの最後の記録日と停滞判定用のセットに分ける
export type TraineeActivity = {
  last: Record<string, string>
  samples: { user_id: string; exercise: string; trained_on: string; weight_kg: number | string; reps: number }[]
}

export function parseTraineeActivity(activity: TraineeActivity | null | undefined) {
  const lastByUser = new Map(Object.entries(activity?.last ?? {}))
  const oneRmByUser = new Map<string, OneRmSetSample[]>()
  for (const s of activity?.samples ?? []) {
    const list = oneRmByUser.get(s.user_id) ?? []
    list.push({ exerciseKey: s.exercise, trainedOn: s.trained_on, weightKg: Number(s.weight_kg), reps: Number(s.reps) })
    oneRmByUser.set(s.user_id, list)
  }
  return { lastByUser, oneRmByUser }
}

export type TraineeAlert = { kind: 'no_record' | 'stalled'; message: string }

const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (fromIso: string, to: Date) => Math.floor((to.getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()) / DAY_MS)

export function traineeAlerts(params: {
  status: string
  startedAt: string | null
  /** プランの開始日（coaching_plans.start_date）。無ければ契約の開始日だけで判定 */
  planStartDate?: string | null
  lastTrainedOn: string | null
  oneRmSets: OneRmSetSample[]
  today: Date
}): TraineeAlert[] {
  const { status, lastTrainedOn, oneRmSets, today, planStartDate } = params
  if (status !== 'active' || !params.startedAt) return []
  const contractStart = params.startedAt.slice(0, 10)
  const startedAt = planStartDate && planStartDate > contractStart ? planStartDate : contractStart
  if (daysBetween(startedAt, today) < 0) return []
  const alerts: TraineeAlert[] = []

  const sinceLast = lastTrainedOn ? daysBetween(lastTrainedOn, today) : null
  const sinceStart = daysBetween(startedAt, today)
  if (sinceLast != null ? sinceLast >= NO_RECORD_ALERT_DAYS : sinceStart >= NO_RECORD_ALERT_DAYS) {
    alerts.push({
      kind: 'no_record',
      message: sinceLast != null ? `${sinceLast}日間記録がありません` : `${startedAt === contractStart ? '契約開始' : 'プラン開始'}から${sinceStart}日間記録がありません`,
    })
  }

  // 直近3週間で、それ以前の自己ベスト（推定1RM）を超えた1RM管理種目が1つも無ければ停滞
  if (sinceStart >= STALL_ALERT_DAYS) {
    const best = new Map<string, { before: number; recent: number }>()
    for (const s of oneRmSets) {
      if (s.weightKg <= 0 || s.reps <= 0) continue
      const e1rm = estimateOneRm(s.weightKg, s.reps, 0.5)
      const entry = best.get(s.exerciseKey) ?? { before: 0, recent: 0 }
      if (daysBetween(s.trainedOn, today) < STALL_ALERT_DAYS) entry.recent = Math.max(entry.recent, e1rm)
      else entry.before = Math.max(entry.before, e1rm)
      best.set(s.exerciseKey, entry)
    }
    const comparable = [...best.values()].filter(b => b.before > 0 && b.recent > 0)
    if (comparable.length > 0 && comparable.every(b => b.recent <= b.before)) {
      alerts.push({ kind: 'stalled', message: '直近3週間、BIG3などの推定1RMが更新されていません' })
    }
  }
  return alerts
}
