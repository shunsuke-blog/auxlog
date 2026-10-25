import type { SupabaseClient } from '@supabase/supabase-js'
import { activitySince, loadTraineeRows, type TraineeRow } from './trainees'
import { parseTraineeActivity, type TraineeActivity } from './traineeStatus'
import { dashboardTodos, highlights, sortActivity, weekSummary, type ActivityEvent, type TodoItem, type WeekSummary } from './dashboard'

// トレーナーのダッシュボードのデータ読み込み。トレーナー本人のセッション（RLS）で読むため、契約期間外の
// 記録や他人のトレーニーのデータは DB 側で除外される（契約者一覧と同じ）。トレーナー自身の記録は出さない。

export type NamedLink = { linkId: string; name: string }

export type DashboardData = {
  rows: TraineeRow[]
  activeCount: number
  todos: TodoItem[]
  week: WeekSummary
  activity: ActivityEvent[]
  highlights: { linkId: string; name: string; exercise: string; beforeKg: number; recentKg: number; gainKg: number; trainedOn: string }[]
  /** %1RM のセットに重量がまだ入っていないプラン（1RM未入力で共有。初回の記録から自動で入る） */
  awaitingOneRm: NamedLink[]
  /** プランが最終週の人（次のプランの準備の目安） */
  finalWeek: NamedLink[]
}

type SessionRow = {
  id: string
  user_id: string
  trained_at: string
  created_at: string
  training_sets: { exercise_id: string; plan_exercises: { plan_days: { week_number: number; day_number: number; plan_id: string } | null } | null }[]
}

export const ACTIVITY_LIMIT = 12

export async function loadDashboard(supabase: SupabaseClient, trainerId: string, now = new Date()): Promise<DashboardData> {
  const { data: activityData } = await supabase.rpc('trainer_trainee_activity', { p_since: activitySince(now) })
  const rows = await loadTraineeRows(supabase, trainerId, now, (activityData ?? null) as TraineeActivity | null)
  const trainees = rows.filter(r => !r.isSelf)

  // 同じ人と契約し直している場合は、契約中の契約を優先して名前・リンク先にする
  const linkByUser = new Map<string, TraineeRow>()
  for (const r of trainees) if (r.traineeId && (!linkByUser.has(r.traineeId) || r.status === 'active')) linkByUser.set(r.traineeId, r)
  const traineeIds = [...linkByUser.keys()]
  const linkIds = trainees.map(r => r.linkId)

  const [{ data: sessions }, { data: plans }] = await Promise.all([
    traineeIds.length > 0
      ? supabase
          .from('training_sessions')
          .select('id, user_id, trained_at, created_at, training_sets(exercise_id, plan_exercises(plan_days(week_number, day_number, plan_id)))')
          .in('user_id', traineeIds)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_LIMIT)
      : Promise.resolve({ data: [] }),
    linkIds.length > 0
      ? supabase.from('coaching_plans').select('id, name, link_id, started_at').in('link_id', linkIds)
      : Promise.resolve({ data: [] }),
  ])
  const planName = new Map((plans ?? []).map(p => [p.id as string, p.name as string]))
  const linkById = new Map(trainees.map(r => [r.linkId, r]))

  // ── 最近のアクティビティ: 契約の開始・プランの開始・記録・契約の終了 ──
  const events: ActivityEvent[] = []
  for (const r of trainees) {
    if (r.startedAt) events.push({ at: r.startedAt, linkId: r.linkId, name: r.name, kind: 'contract_started', text: '招待コードを入力して契約を始めました' })
    if (r.endedAt) events.push({ at: r.endedAt, linkId: r.linkId, name: r.name, kind: 'contract_ended', text: '契約が終了しました' })
  }
  for (const p of plans ?? []) {
    const link = linkById.get(p.link_id as string)
    if (link && p.started_at) events.push({ at: p.started_at as string, linkId: link.linkId, name: link.name, kind: 'plan_started', text: `「${p.name}」を始めました` })
  }
  for (const s of (sessions ?? []) as unknown as SessionRow[]) {
    const link = linkByUser.get(s.user_id)
    if (!link) continue
    const count = new Set(s.training_sets.map(t => t.exercise_id)).size
    const day = s.training_sets.map(t => t.plan_exercises?.plan_days).find(d => d != null)
    events.push({
      at: s.created_at,
      linkId: link.linkId,
      name: link.name,
      kind: 'recorded',
      text: day
        ? `「${planName.get(day.plan_id) ?? 'プラン'}」の Week ${day.week_number} Day ${day.day_number} を記録しました（${count}種目）`
        : `トレーニングを記録しました（${count}種目）`,
    })
  }

  // ── 成果のハイライト: 種目名は種目マスタから引く（1RM管理種目はマスタの種目だけ） ──
  const { oneRmByUser } = parseTraineeActivity((activityData ?? null) as TraineeActivity | null)
  const found = highlights(new Map([...oneRmByUser].filter(([userId]) => linkByUser.has(userId))), now).slice(0, 10)
  const exerciseIds = [...new Set(found.map(h => h.exerciseKey))]

  // ── 1RM未入力のプラン: 進行中のプランごとに「%1RM なのに重量が空のセット」が1つでもあるか ──
  const livePlans = trainees.filter(r => r.status === 'active' && r.plan && (r.plan.status === 'shared' || r.plan.status === 'active'))
  const [{ data: names }, awaitingChecks] = await Promise.all([
    exerciseIds.length > 0 ? supabase.from('exercise_master').select('id, name').in('id', exerciseIds) : Promise.resolve({ data: [] }),
    Promise.all(livePlans.map(r =>
      supabase
        .from('plan_sets')
        .select('id, plan_exercises!inner(plan_days!inner(plan_id))')
        .eq('plan_exercises.plan_days.plan_id', r.plan!.id)
        .not('target_pct_1rm', 'is', null)
        .is('target_weight_kg', null)
        .limit(1)
        .then(({ data }) => ((data ?? []).length > 0 ? r : null)),
    )),
  ])
  const nameById = new Map((names ?? []).map(n => [n.id as string, n.name as string]))

  return {
    rows,
    activeCount: trainees.filter(r => r.status === 'active').length,
    todos: dashboardTodos(rows),
    week: weekSummary(rows),
    activity: sortActivity(events, ACTIVITY_LIMIT),
    highlights: found.map(h => {
      const link = linkByUser.get(h.userId)
      return { linkId: link?.linkId ?? '', name: link?.name ?? '', exercise: nameById.get(h.exerciseKey) ?? '種目', beforeKg: h.beforeKg, recentKg: h.recentKg, gainKg: h.gainKg, trainedOn: h.trainedOn }
    }),
    awaitingOneRm: awaitingChecks.filter((r): r is TraineeRow => r != null).map(r => ({ linkId: r.linkId, name: r.name })),
    finalWeek: livePlans.filter(r => r.plan!.currentWeek >= r.plan!.totalWeeks).map(r => ({ linkId: r.linkId, name: r.name })),
  }
}
