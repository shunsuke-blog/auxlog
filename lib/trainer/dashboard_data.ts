import type { SupabaseClient } from '@supabase/supabase-js'
import { activitySince, loadTraineeRows, type TraineeRow } from './trainees'
import { parseTraineeActivity, type TraineeActivity } from './traineeStatus'
import {
  dashboardTodos, highlights, notStartedThisWeek, pendingInvites, repeatedSkips, shortfalls, sortActivity, usedTraineeSlots, weekSummary,
  type ActivityEvent, type DashboardItem, type RecordedExercise, type SkippedExercise, type TodoItem, type WeekSummary,
} from './dashboard'
import { todayInJapan } from '@/lib/coaching/week_dates'

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
  /** プランが最終週の人（次のプランの準備の目安） */
  finalWeek: NamedLink[]
  /** 契約中などで上限に数える人数（無料の上限 FREE_TRAINEE_LIMIT と比べる） */
  usedSlots: number
  /** アラート: プランの目標に届かなかった記録（直近2週間）・今週まだ記録なし */
  shortfalls: DashboardItem[]
  notStarted: DashboardItem[]
  /** ToDo: スキップの多い種目・招待中で未入力 */
  repeatedSkips: DashboardItem[]
  pendingInvites: DashboardItem[]
}

/** 目標未達を見る期間（直近2週間の記録） */
export const SHORTFALL_DAYS = 14

type ExerciseRef = { name: string } | null
type PlanRecordRow = {
  set_number: number
  weight_kg: number | string
  reps: number
  is_warmup: boolean
  plan_exercise_id: string
  training_sessions: { trained_at: string }
  plan_exercises: { exercise_master: ExerciseRef; trainer_exercises: ExerciseRef; plan_sets: { set_number: number; target_weight_kg: number | string | null; target_reps: number; is_warmup: boolean }[] }
}
type SkipRow = {
  plan_exercises: { exercise_master_id: string | null; trainer_exercise_id: string | null; exercise_master: ExerciseRef; trainer_exercises: ExerciseRef; plan_days: { week_number: number } }
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
    if (r.startedAt) events.push({ at: r.startedAt, linkId: r.linkId, name: r.name, kind: 'contract_started', text: 'が招待コードを入力して契約を始めました' })
    if (r.endedAt) events.push({ at: r.endedAt, linkId: r.linkId, name: r.name, kind: 'contract_ended', text: 'との契約が終了しました' })
  }
  for (const p of plans ?? []) {
    const link = linkById.get(p.link_id as string)
    if (link && p.started_at) events.push({ at: p.started_at as string, linkId: link.linkId, name: link.name, kind: 'plan_started', text: `が「${p.name}」を始めました` })
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
        ? `が「${planName.get(day.plan_id) ?? 'プラン'}」の Week ${day.week_number} Day ${day.day_number} を記録しました（${count}種目）`
        : `がトレーニングを記録しました（${count}種目）`,
    })
  }

  // ── 成果のハイライト: 種目名は種目マスタから引く（1RM管理種目はマスタの種目だけ） ──
  const { oneRmByUser } = parseTraineeActivity((activityData ?? null) as TraineeActivity | null)
  const found = highlights(new Map([...oneRmByUser].filter(([userId]) => linkByUser.has(userId))), now).slice(0, 10)
  const exerciseIds = [...new Set(found.map(h => h.exerciseKey))]

  const livePlans = trainees.filter(r => r.status === 'active' && r.plan && (r.plan.status === 'shared' || r.plan.status === 'active'))
  const { data: names } = exerciseIds.length > 0
    ? await supabase.from('exercise_master').select('id, name').in('id', exerciseIds)
    : { data: [] }
  const nameById = new Map((names ?? []).map(n => [n.id as string, n.name as string]))

  // ── 進行中のプランごとに、直近2週間の記録（目標との突き合わせ）とスキップを読む。件数が多くならないようプランごとに分ける ──
  const since = new Date(now.getTime() - SHORTFALL_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const perPlan = await Promise.all(livePlans.map(async r => {
    const planId = r.plan!.id
    const [{ data: recs }, { data: skips }] = await Promise.all([
      supabase
        .from('training_sets')
        .select('set_number, weight_kg, reps, is_warmup, plan_exercise_id, training_sessions!inner(trained_at), plan_exercises!inner(exercise_master(name), trainer_exercises(name), plan_sets(set_number, target_weight_kg, target_reps, is_warmup), plan_days!inner(plan_id))')
        .eq('plan_exercises.plan_days.plan_id', planId)
        .gte('training_sessions.trained_at', since),
      supabase
        .from('plan_exercise_skips')
        .select('plan_exercises!inner(exercise_master_id, trainer_exercise_id, exercise_master(name), trainer_exercises(name), plan_days!inner(plan_id, week_number))')
        .eq('plan_exercises.plan_days.plan_id', planId),
    ])
    // 記録は種目（プランの種目）ごとにまとめ、目標のセットと突き合わせる
    const byExercise = new Map<string, RecordedExercise>()
    for (const t of (recs ?? []) as unknown as PlanRecordRow[]) {
      const pe = t.plan_exercises
      const entry = byExercise.get(t.plan_exercise_id) ?? {
        linkId: r.linkId,
        name: r.name,
        exercise: pe.exercise_master?.name ?? pe.trainer_exercises?.name ?? '種目',
        trainedOn: t.training_sessions.trained_at,
        actual: [],
        targets: pe.plan_sets.map(ps => ({ setNumber: ps.set_number, weightKg: ps.target_weight_kg == null ? null : Number(ps.target_weight_kg), reps: ps.target_reps, isWarmup: ps.is_warmup })),
      }
      entry.actual.push({ setNumber: t.set_number, weightKg: Number(t.weight_kg), reps: t.reps, isWarmup: t.is_warmup })
      byExercise.set(t.plan_exercise_id, entry)
    }
    const skipped: SkippedExercise[] = ((skips ?? []) as unknown as SkipRow[]).map(k => ({
      linkId: r.linkId,
      name: r.name,
      exerciseKey: k.plan_exercises.exercise_master_id ?? k.plan_exercises.trainer_exercise_id ?? '',
      exercise: k.plan_exercises.exercise_master?.name ?? k.plan_exercises.trainer_exercises?.name ?? '種目',
      week: k.plan_exercises.plan_days.week_number,
      currentWeek: r.plan!.currentWeek,
    }))
    return { records: [...byExercise.values()], skipped }
  }))

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
    finalWeek: livePlans.filter(r => r.plan!.currentWeek >= r.plan!.totalWeeks).map(r => ({ linkId: r.linkId, name: r.name })),
    usedSlots: usedTraineeSlots(rows),
    shortfalls: shortfalls(perPlan.flatMap(p => p.records).sort((x, y) => y.trainedOn.localeCompare(x.trainedOn))),
    notStarted: notStartedThisWeek(rows, todayInJapan(now)),
    repeatedSkips: repeatedSkips(perPlan.flatMap(p => p.skipped)),
    pendingInvites: pendingInvites(rows),
  }
}
