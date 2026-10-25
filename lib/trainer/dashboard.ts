// トレーナーのダッシュボードの集計（DBに依存しない純粋関数）。決定事項（2026-10-25）:
//   - 要対応: アラート（7日以上記録なし・3週間停滞）、期限切れの招待コード、プランが終わって次のプラン待ちの人
//   - 今週の実施状況: 契約中の全員の今週の達成率（記録した種目 ÷ 予定。スキップは分母から除く）と人ごとの進み具合
//   - 成果のハイライト: 直近4週間で、それ以前（〜120日前）の推定1RMを更新した種目（1RM管理種目のみ）

import { estimateOneRm } from '@/lib/utils/epley'
import type { TraineeRow } from './trainees'
import type { OneRmSetSample } from './traineeStatus'

export const HIGHLIGHT_DAYS = 28
/** 推定1RMの丸め誤差での微増を「更新」と言わない（成長レポートと同じ 1kg 以上） */
export const HIGHLIGHT_MIN_GAIN_KG = 1

export type TodoItem = { linkId: string; name: string; kind: 'no_record' | 'stalled' | 'invite_expired' | 'waiting_plan'; message: string }

const isLive = (status: string) => status === 'shared' || status === 'active'

export function dashboardTodos(rows: TraineeRow[]): TodoItem[] {
  const items: TodoItem[] = []
  for (const r of rows) {
    if (r.isSelf) continue
    for (const a of r.alerts) items.push({ linkId: r.linkId, name: r.name, kind: a.kind, message: a.message })
    if (r.status === 'invited' && r.invite?.expired) {
      items.push({ linkId: r.linkId, name: r.name, kind: 'invite_expired', message: '招待コードの期限が切れています（再発行してください）' })
    }
    if (r.status === 'active' && (!r.plan || !isLive(r.plan.status))) {
      items.push({ linkId: r.linkId, name: r.name, kind: 'waiting_plan', message: r.plan ? 'プランが終わりました。次のプランを共有してください' : 'プランがありません。プランを共有してください' })
    }
  }
  // 記録なし → 停滞 → 次のプラン待ち → 招待コード の順（トレーニーに連絡が要るものから）
  const order: Record<TodoItem['kind'], number> = { no_record: 0, stalled: 1, waiting_plan: 2, invite_expired: 3 }
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'ja'))
}

export type WeekSummary = {
  done: number
  total: number
  skipped: number
  /** 達成率（%）。予定が無ければ null */
  pct: number | null
  people: { linkId: string; name: string; done: number; total: number; skipped: number; week: number | null }[]
}

export function weekSummary(rows: TraineeRow[]): WeekSummary {
  const people = rows
    .filter(r => !r.isSelf && r.status === 'active' && r.progress && r.plan && isLive(r.plan.status))
    .map(r => ({ linkId: r.linkId, name: r.name, ...r.progress!, week: r.plan?.currentWeek ?? null }))
    // 進みの遅い人を上に（声をかける順）
    .sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name, 'ja'))
  const done = people.reduce((s, p) => s + p.done, 0)
  const total = people.reduce((s, p) => s + p.total, 0)
  const skipped = people.reduce((s, p) => s + p.skipped, 0)
  return { done, total, skipped, pct: total > 0 ? Math.round((done / total) * 100) : null, people }
}

const ratio = (p: { done: number; total: number }) => (p.total > 0 ? p.done / p.total : 1)

export type Highlight = { userId: string; exerciseKey: string; beforeKg: number; recentKg: number; gainKg: number; trainedOn: string }

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (iso: string, today: Date) => Math.floor((today.getTime() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / DAY_MS)

/** 直近4週間の推定1RMが、それ以前の自己ベストを1kg以上上回った種目（伸びの大きい順） */
export function highlights(samplesByUser: ReadonlyMap<string, OneRmSetSample[]>, today: Date): Highlight[] {
  const result: Highlight[] = []
  for (const [userId, samples] of samplesByUser) {
    const best = new Map<string, { before: number; recent: number; recentOn: string }>()
    for (const s of samples) {
      if (s.weightKg <= 0 || s.reps <= 0) continue
      const e1rm = estimateOneRm(s.weightKg, s.reps, 0.5)
      const entry = best.get(s.exerciseKey) ?? { before: 0, recent: 0, recentOn: '' }
      if (daysAgo(s.trainedOn, today) < HIGHLIGHT_DAYS) {
        if (e1rm > entry.recent) { entry.recent = e1rm; entry.recentOn = s.trainedOn }
      } else entry.before = Math.max(entry.before, e1rm)
      best.set(s.exerciseKey, entry)
    }
    for (const [exerciseKey, b] of best) {
      if (b.before > 0 && b.recent - b.before >= HIGHLIGHT_MIN_GAIN_KG) {
        result.push({ userId, exerciseKey, beforeKg: b.before, recentKg: b.recent, gainKg: Math.round((b.recent - b.before) * 10) / 10, trainedOn: b.recentOn })
      }
    }
  }
  return result.sort((a, b) => b.gainKg - a.gainKg || b.trainedOn.localeCompare(a.trainedOn))
}

export type ActivityEvent = {
  at: string
  linkId: string
  name: string
  kind: 'contract_started' | 'plan_started' | 'recorded' | 'contract_ended'
  /** 名前の後ろに続く文（助詞から。例: 「が記録しました」「との契約が終了しました」） */
  text: string
}

/** 新しい順に並べ、最大 limit 件 */
export function sortActivity(events: ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

const JST_MS = 9 * 60 * 60 * 1000
const jstParts = (d: Date) => {
  const j = new Date(d.getTime() + JST_MS)
  return { ymd: j.toISOString().slice(0, 10), month: j.getUTCMonth() + 1, day: j.getUTCDate(), hm: j.toISOString().slice(11, 16) }
}

/** アクティビティの時刻（日本時間）: 今日なら「今日」、昨日なら「昨日」、それ以外は「10/24」＋時刻 */
export function formatActivityTime(iso: string, now: Date): { day: string; time: string | null } {
  // 日付だけの値（記録の日など）は時刻を出さない
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const at = jstParts(dateOnly ? new Date(`${iso}T00:00:00+09:00`) : new Date(iso))
  const today = jstParts(now)
  const yesterday = jstParts(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const day = at.ymd === today.ymd ? '今日' : at.ymd === yesterday.ymd ? '昨日' : `${at.month}/${at.day}`
  return { day, time: dateOnly ? null : at.hm }
}

// ── 2026-10-25 追加: 目標未達・招待できる残り人数・今週まだ記録なし・スキップの多い種目・招待中で未入力 ──

/**
 * トレーナーのプランと、契約できるクライアントの上限（2026-10-25 料金体系）。DB の trainer_trainee_limit()（追加を拒否する上限）と
 * 同じ値。limit が null は無制限（ビジネス）
 */
export const TRAINER_PLANS: Record<'starter' | 'pro' | 'business', { label: string; limit: number | null }> = {
  starter: { label: 'スタータープラン', limit: 3 },
  pro: { label: 'プロプラン', limit: 30 },
  business: { label: 'ビジネスプラン', limit: null },
}

/** 上限に数える契約（招待中・契約中・一時停止中、自分は除く。DB の add_trainee_with_plan と同じ数え方） */
export function usedTraineeSlots(rows: TraineeRow[]): number {
  return rows.filter(r => !r.isSelf && (r.status === 'invited' || r.status === 'active' || r.status === 'paused')).length
}

export type DashboardItem = { linkId: string; name: string; text: string }

/** 週の半ば（4日目）を過ぎても、今週まだ1種目も記録していない人。7日記録なしのアラートが出ている人は除く（重複させない） */
export const NOT_STARTED_FROM_DAY = 4

export function notStartedThisWeek(rows: TraineeRow[], todayJst: string): DashboardItem[] {
  const items: DashboardItem[] = []
  for (const r of rows) {
    if (r.isSelf || r.status !== 'active' || !r.plan?.startDate || !r.progress || !isLive(r.plan.status)) continue
    if (r.progress.done > 0 || r.alerts.some(a => a.kind === 'no_record')) continue
    const weekStart = new Date(`${r.plan.startDate}T00:00:00Z`)
    weekStart.setUTCDate(weekStart.getUTCDate() + (r.plan.currentWeek - 1) * 7)
    const day = Math.floor((new Date(`${todayJst}T00:00:00Z`).getTime() - weekStart.getTime()) / DAY_MS) + 1
    if (day >= NOT_STARTED_FROM_DAY && day <= 7) items.push({ linkId: r.linkId, name: r.name, text: `今週（Week ${r.plan.currentWeek}）はまだ記録がありません（${day}日目）` })
  }
  return items
}

export type RecordedExercise = {
  linkId: string
  name: string
  exercise: string
  trainedOn: string
  actual: { setNumber: number; weightKg: number; reps: number; isWarmup: boolean }[]
  targets: { setNumber: number; weightKg: number | null; reps: number; isWarmup: boolean }[]
}

/**
 * プランの目標に届かなかった記録。ワーキングセットを順に目標と突き合わせ、最初に届かなかったセットを出す。
 * 届かない = 目標の重量があるのに軽くした、または回数（時間で行う種目は秒数）が目標より少ない。
 * 目標より多いセットを足した分・少ないセット数は見ない（回数・重量だけで判定）。
 */
export function shortfalls(records: RecordedExercise[]): DashboardItem[] {
  const items: DashboardItem[] = []
  for (const r of records) {
    const unit = r.exercise.includes('（秒）') ? '秒' : '回'
    const actual = r.actual.filter(s => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber)
    const targets = r.targets.filter(s => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber)
    for (let i = 0; i < Math.min(actual.length, targets.length); i++) {
      const a = actual[i]
      const t = targets[i]
      const lighter = t.weightKg != null && a.weightKg < t.weightKg
      if (!lighter && a.reps >= t.reps) continue
      const target = `${t.weightKg != null ? `${t.weightKg}kg×` : ''}${t.reps}${unit}`
      const done = lighter ? `${a.weightKg}kg×${a.reps}${unit}` : `${a.reps}${unit}`
      items.push({ linkId: r.linkId, name: r.name, text: `${r.exercise} 目標 ${target} → ${done}（${r.trainedOn.slice(5).replace('-', '/').replace(/^0/, '')}）` })
      break
    }
  }
  return items
}

export type SkippedExercise = { linkId: string; name: string; exerciseKey: string; exercise: string; week: number; currentWeek: number }

/** 直近3週（今週を含む）のうち2週以上でスキップした種目。器具が無い・痛み・合っていないなどの、種目の入れ替えの合図 */
export const SKIP_WINDOW_WEEKS = 3
export const SKIP_MIN_WEEKS = 2

export function repeatedSkips(skips: SkippedExercise[]): DashboardItem[] {
  const weeks = new Map<string, { item: SkippedExercise; weeks: Set<number> }>()
  for (const s of skips) {
    if (s.week > s.currentWeek || s.week <= s.currentWeek - SKIP_WINDOW_WEEKS) continue
    const key = `${s.linkId}:${s.exerciseKey}`
    const entry = weeks.get(key) ?? { item: s, weeks: new Set<number>() }
    entry.weeks.add(s.week)
    weeks.set(key, entry)
  }
  return [...weeks.values()]
    .filter(e => e.weeks.size >= SKIP_MIN_WEEKS)
    .map(e => ({ linkId: e.item.linkId, name: e.item.name, text: `${e.item.exercise}を直近${SKIP_WINDOW_WEEKS}週で${e.weeks.size}回スキップ。種目の入れ替えを検討する` }))
}

/** 招待コードを発行したが、まだ入力されていない人（期限切れは別の ToDo「再発行する」） */
export function pendingInvites(rows: TraineeRow[]): DashboardItem[] {
  return rows
    .filter(r => !r.isSelf && r.status === 'invited' && r.invite && !r.invite.expired)
    .map(r => ({ linkId: r.linkId, name: r.name, text: `招待コード ${r.invite!.code} がまだ入力されていません（${r.invite!.expiresAt.slice(5, 10).replace('-', '/').replace(/^0/, '')}まで）。本人に連絡する` }))
}
