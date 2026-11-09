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
  /** 契約中などで上限に数える人数（プランの上限 TRAINER_PLANS と比べる） */
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
  plan_exercises: { exercise_master_id: string | null; trainer_exercise_id: string | null; cardio_master_id: string | null; exercise_master: ExerciseRef; trainer_exercises: ExerciseRef; cardio_master: ExerciseRef; plan_sets: { set_number: number; target_weight_kg: number | string | null; target_reps: number; is_warmup: boolean }[] }
}
type SkipRow = {
  plan_exercises: { exercise_master_id: string | null; trainer_exercise_id: string | null; cardio_master_id: string | null; exercise_master: ExerciseRef; trainer_exercises: ExerciseRef; cardio_master: ExerciseRef; plan_days: { week_number: number } }
}

type SessionRow = {
  id: string
  user_id: string
  trained_at: string
  created_at: string
  training_sets: { exercise_id: string; user_exercises: { custom_name: string | null; exercise_master: { name: string } | null } | null; plan_exercises: { plan_days: { week_number: number; day_number: number; plan_id: string } | null } | null }[]
}

export const ACTIVITY_LIMIT = 12
/** アクティビティを1人・1日にまとめるために読む記録の数（1日に種目ごとに保存するので、ACTIVITY_LIMIT よりかなり多く読む） */
const ACTIVITY_SESSIONS = 300

export async function loadDashboard(supabase: SupabaseClient, trainerId: string, now = new Date()): Promise<DashboardData> {
  const { data: activityData } = await supabase.rpc('trainer_trainee_activity', { p_since: activitySince(now) })
  const rows = await loadTraineeRows(supabase, trainerId, now, (activityData ?? null) as TraineeActivity | null)
  const trainees = rows.filter(r => !r.isSelf)

  // 同じ人と契約し直している場合は、契約中の契約を優先して名前・リンク先にする
  const linkByUser = new Map<string, TraineeRow>()
  for (const r of trainees) if (r.traineeId && (!linkByUser.has(r.traineeId) || r.status === 'active')) linkByUser.set(r.traineeId, r)
  const traineeIds = [...linkByUser.keys()]
  const linkIds = trainees.map(r => r.linkId)

  const [{ data: sessions }, { data: plans }, { data: acks }] = await Promise.all([
    traineeIds.length > 0
      ? supabase
          .from('training_sessions')
          .select('id, user_id, trained_at, created_at, training_sets(exercise_id, user_exercises(custom_name, exercise_master(name)), plan_exercises(plan_days(week_number, day_number, plan_id)))')
          .in('user_id', traineeIds)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_SESSIONS)
      : Promise.resolve({ data: [] }),
    linkIds.length > 0
      ? supabase.from('coaching_plans').select('id, name, link_id, started_at').in('link_id', linkIds)
      : Promise.resolve({ data: [] }),
    // 「確認した」で消したアラート（トレーナーごと、2026-11-09）
    supabase.from('trainer_alert_acks').select('link_id, alert_key').eq('trainer_id', trainerId),
  ])
  const acked = new Set((acks ?? []).map(a => `${a.link_id}:${a.alert_key}`))
  const notAcked = <T extends { linkId: string; ackKey?: string }>(items: T[]) => items.filter(i => !i.ackKey || !acked.has(`${i.linkId}:${i.ackKey}`))
  const planName = new Map((plans ?? []).map(p => [p.id as string, p.name as string]))
  const linkById = new Map(trainees.map(r => [r.linkId, r]))

  // ── 最近のアクティビティ: 契約の開始・プランの開始・記録・契約の終了 ──
  const events: ActivityEvent[] = []
  for (const r of trainees) {
    if (r.startedAt) events.push({ at: r.startedAt, linkId: r.linkId, name: r.name, kind: 'contract_started', text: 'が招待を受け取って契約を始めました' })
    if (r.endedAt) events.push({ at: r.endedAt, linkId: r.linkId, name: r.name, kind: 'contract_ended', text: 'との契約が終了しました' })
  }
  for (const p of plans ?? []) {
    const link = linkById.get(p.link_id as string)
    if (link && p.started_at) events.push({ at: p.started_at as string, linkId: link.linkId, name: link.name, kind: 'plan_started', text: `が「${p.name}」を始めました` })
  }
  // 記録は1人・1日で1行にまとめる（2026-11-09 オーナー指摘: プランは種目ごとに保存するので、1回の保存ずつだと細かすぎて
  // 複数のクライアントを把握できない）。時刻はその日の最後の記録、Day はその日に記録した Day を並べる
  const byPersonDay = new Map<string, { link: TraineeRow; at: string; planIds: Set<string>; days: { week: number; day: number }[]; exercises: Set<string>; offPlanNames: Set<string> }>()
  for (const s of (sessions ?? []) as unknown as SessionRow[]) {
    const link = linkByUser.get(s.user_id)
    if (!link) continue
    const key = `${s.user_id}:${s.trained_at}`
    const entry = byPersonDay.get(key) ?? { link, at: s.created_at, planIds: new Set<string>(), days: [], exercises: new Set<string>(), offPlanNames: new Set<string>() }
    if (s.created_at > entry.at) entry.at = s.created_at
    for (const t of s.training_sets) {
      entry.exercises.add(t.exercise_id)
      const d = t.plan_exercises?.plan_days
      if (d) {
        entry.planIds.add(d.plan_id)
        if (!entry.days.some(x => x.week === d.week_number && x.day === d.day_number)) entry.days.push({ week: d.week_number, day: d.day_number })
      } else {
        entry.offPlanNames.add(t.user_exercises?.exercise_master?.name ?? t.user_exercises?.custom_name ?? '種目')
      }
    }
    byPersonDay.set(key, entry)
  }
  for (const e of byPersonDay.values()) {
    const days = [...e.days].sort((a, b) => a.week - b.week || a.day - b.day)
    const sameWeek = days.every(d => d.week === days[0]?.week)
    const dayText = days.length === 0 ? '' : sameWeek
      ? `Week ${days[0].week} ${days.map(d => `Day ${d.day}`).join(' と ')}`
      : days.map(d => `Week ${d.week} Day ${d.day}`).join(' と ')
    const plan = e.planIds.size === 1 ? planName.get([...e.planIds][0]) : null
    events.push({
      at: e.at,
      linkId: e.link.linkId,
      name: e.link.name,
      kind: 'recorded',
      text: days.length > 0
        ? `が${plan ? `「${plan}」の ` : ''}${dayText} を記録しました（${e.exercises.size}種目${e.offPlanNames.size > 0 ? '、プラン外を含む' : ''}）`
        // プランの種目に紐付いていない記録だけ＝トレーニーが「種目を追加」から記録した、プラン外の種目
        : `がプラン外の種目を記録しました（${[...e.offPlanNames].join('、')}）`,
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
        .select('set_number, weight_kg, reps, is_warmup, plan_exercise_id, training_sessions!inner(trained_at), plan_exercises!inner(exercise_master_id, trainer_exercise_id, cardio_master_id, exercise_master(name), trainer_exercises(name), cardio_master(name), plan_sets(set_number, target_weight_kg, target_reps, is_warmup), plan_days!inner(plan_id))')
        .eq('plan_exercises.plan_days.plan_id', planId)
        .gte('training_sessions.trained_at', since),
      supabase
        .from('plan_exercise_skips')
        .select('plan_exercises!inner(exercise_master_id, trainer_exercise_id, cardio_master_id, exercise_master(name), trainer_exercises(name), cardio_master(name), plan_days!inner(plan_id, week_number))')
        .eq('plan_exercises.plan_days.plan_id', planId),
    ])
    // 記録は種目（プランの種目）ごとにまとめ、目標のセットと突き合わせる
    const byExercise = new Map<string, RecordedExercise>()
    for (const t of (recs ?? []) as unknown as PlanRecordRow[]) {
      const pe = t.plan_exercises
      const entry = byExercise.get(t.plan_exercise_id) ?? {
        linkId: r.linkId,
        name: r.name,
        exercise: pe.exercise_master?.name ?? pe.trainer_exercises?.name ?? pe.cardio_master?.name ?? '種目',
        exerciseKey: pe.exercise_master_id ?? pe.trainer_exercise_id ?? pe.cardio_master_id ?? undefined,
        planExerciseId: t.plan_exercise_id,
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
      exerciseKey: k.plan_exercises.exercise_master_id ?? k.plan_exercises.trainer_exercise_id ?? k.plan_exercises.cardio_master_id ?? '',
      exercise: k.plan_exercises.exercise_master?.name ?? k.plan_exercises.trainer_exercises?.name ?? k.plan_exercises.cardio_master?.name ?? '種目',
      week: k.plan_exercises.plan_days.week_number,
      currentWeek: r.plan!.currentWeek,
    }))
    return { records: [...byExercise.values()], skipped }
  }))

  return {
    rows,
    activeCount: trainees.filter(r => r.status === 'active').length,
    todos: notAcked(dashboardTodos(rows)),
    week: weekSummary(rows),
    activity: sortActivity(events, ACTIVITY_LIMIT),
    highlights: found.map(h => {
      const link = linkByUser.get(h.userId)
      return { linkId: link?.linkId ?? '', name: link?.name ?? '', exercise: nameById.get(h.exerciseKey) ?? '種目', beforeKg: h.beforeKg, recentKg: h.recentKg, gainKg: h.gainKg, trainedOn: h.trainedOn }
    }),
    finalWeek: livePlans.filter(r => r.plan!.currentWeek >= r.plan!.totalWeeks).map(r => ({ linkId: r.linkId, name: r.name })),
    usedSlots: usedTraineeSlots(rows),
    shortfalls: notAcked(shortfalls(perPlan.flatMap(p => p.records).sort((x, y) => y.trainedOn.localeCompare(x.trainedOn)))),
    notStarted: notAcked(notStartedThisWeek(rows, todayInJapan(now))),
    repeatedSkips: repeatedSkips(perPlan.flatMap(p => p.skipped)),
    pendingInvites: pendingInvites(rows),
  }
}
