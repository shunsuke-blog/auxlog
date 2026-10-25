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
