import type { SupabaseClient } from '@supabase/supabase-js'
import { BASE_CATEGORIES_BY_RANK, LEG_DEFAULT_CATEGORY } from '@/lib/constants/program_composition'
import { selectInChunks } from '@/lib/supabase/chunk'
import { traineeAlerts, weekProgress, type OneRmSetSample, type TraineeAlert, type WeekProgress } from './traineeStatus'

// トレーナー画面の一覧・詳細のデータ読み込み。すべてトレーナー本人のセッション（RLS）で読むため、
// 契約期間外の記録や他人のトレーニーのデータはDB側で除外される（can_trainer_view 等）。

export type LinkStatus = 'invited' | 'active' | 'paused' | 'ended'

export type TraineeRow = {
  linkId: string
  traineeId: string | null
  name: string
  status: LinkStatus
  isSelf: boolean
  startedAt: string | null
  endedAt: string | null
  plan: { id: string; name: string; currentWeek: number; totalWeeks: number; status: string } | null
  progress: WeekProgress | null
  lastTrainedOn: string | null
  alerts: TraineeAlert[]
  invite: { code: string; expiresAt: string; expired: boolean } | null
}

const STATUS_ORDER: Record<LinkStatus, number> = { active: 0, paused: 1, invited: 2, ended: 3 }

type LinkRow = { id: string; trainee_id: string | null; trainee_display_name: string; status: LinkStatus; started_at: string | null; ended_at: string | null; trainer_id: string }
type PlanRow = { id: string; link_id: string; name: string; status: string; current_week: number; total_weeks: number; created_at: string }

export async function loadTraineeRows(supabase: SupabaseClient, trainerId: string, now = new Date()): Promise<TraineeRow[]> {
  const { data: links } = await supabase
    .from('trainer_trainee_links')
    .select('id, trainer_id, trainee_id, trainee_display_name, status, started_at, ended_at')
    .eq('trainer_id', trainerId)
  const linkRows = (links ?? []) as LinkRow[]
  if (linkRows.length === 0) return []

  const linkIds = linkRows.map(l => l.id)
  const traineeIds = [...new Set(linkRows.map(l => l.trainee_id).filter((id): id is string => id != null))]
  const since = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ data: plans }, { data: invites }, { data: sessions }] = await Promise.all([
    supabase.from('coaching_plans').select('id, link_id, name, status, current_week, total_weeks, created_at').in('link_id', linkIds).order('created_at', { ascending: false }),
    supabase.from('trainer_invites').select('link_id, code, expires_at, created_at').in('link_id', linkIds).is('used_at', null).is('revoked_at', null).order('created_at', { ascending: false }),
    traineeIds.length > 0
      ? supabase.from('training_sessions').select('id, user_id, trained_at').in('user_id', traineeIds).gte('trained_at', since).order('trained_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; user_id: string; trained_at: string }[] }),
  ])

  // 契約ごとに表示するプラン: 進行中（共有済み・開始済み）を優先し、無ければ最新
  const planByLink = new Map<string, PlanRow>()
  for (const p of (plans ?? []) as PlanRow[]) {
    const current = planByLink.get(p.link_id)
    const live = (s: string) => s === 'shared' || s === 'active'
    if (!current || (!live(current.status) && live(p.status))) planByLink.set(p.link_id, p)
  }

  const inviteByLink = new Map<string, { code: string; expires_at: string }>()
  for (const i of invites ?? []) if (!inviteByLink.has(i.link_id)) inviteByLink.set(i.link_id, i)

  const sessionRows = (sessions ?? []) as { id: string; user_id: string; trained_at: string }[]
  const lastByUser = new Map<string, string>()
  for (const s of sessionRows) if (!lastByUser.has(s.user_id)) lastByUser.set(s.user_id, s.trained_at)
  const sessionById = new Map(sessionRows.map(s => [s.id, s]))

  // 停滞アラート用: 1RM管理種目のワーキングセット
  const oneRmByUser = new Map<string, OneRmSetSample[]>()
  if (sessionRows.length > 0) {
    // セッションIDの一覧を URL に並べると件数が多い時に HTTP 400 になるため、結合でトレーニーと期間を条件にする（H1）
    const { data: sets } = await supabase
      .from('training_sets')
      .select('session_id, weight_kg, reps, exercise_id, user_exercises(exercise_master(id, requires_one_rm)), training_sessions!inner(user_id, trained_at)')
      .in('training_sessions.user_id', traineeIds)
      .gte('training_sessions.trained_at', since)
      .eq('is_warmup', false)
    type SetRow = { session_id: string; weight_kg: number; reps: number; exercise_id: string; user_exercises: { exercise_master: { id: string; requires_one_rm: boolean } | null } | null }
    for (const s of (sets ?? []) as unknown as SetRow[]) {
      const master = s.user_exercises?.exercise_master
      if (!master?.requires_one_rm) continue
      const session = sessionById.get(s.session_id)
      if (!session) continue
      const list = oneRmByUser.get(session.user_id) ?? []
      list.push({ exerciseKey: master.id, trainedOn: session.trained_at, weightKg: Number(s.weight_kg), reps: s.reps })
      oneRmByUser.set(session.user_id, list)
    }
  }

  // 今週の進み具合: 進行中のプランの、現在の週の種目
  const livePlans = [...planByLink.values()].filter(p => p.status === 'shared' || p.status === 'active')
  const progressByPlan = new Map<string, WeekProgress>()
  if (livePlans.length > 0) {
    // 各プランの今週の Day だけを読む（全週を読んでから絞らない、M5）
    const { data: days } = await supabase
      .from('plan_days')
      .select('plan_id, week_number, plan_exercises(id)')
      .or(livePlans.map(p => `and(plan_id.eq.${p.id},week_number.eq.${p.current_week})`).join(','))
    const weekOf = new Map(livePlans.map(p => [p.id, p.current_week]))
    const exercisesByPlan = new Map<string, string[]>()
    for (const d of (days ?? []) as { plan_id: string; week_number: number; plan_exercises: { id: string }[] }[]) {
      if (d.week_number !== weekOf.get(d.plan_id)) continue
      exercisesByPlan.set(d.plan_id, [...(exercisesByPlan.get(d.plan_id) ?? []), ...d.plan_exercises.map(e => e.id)])
    }
    const allIds = [...exercisesByPlan.values()].flat()
    // トレーニーが多いと今週の種目IDも数百件になるため、分けて取得する（H1）
    const [recorded, skips] = await Promise.all([
      selectInChunks<{ plan_exercise_id: string }>(allIds, chunk => supabase.from('training_sets').select('plan_exercise_id').in('plan_exercise_id', chunk)),
      selectInChunks<{ plan_exercise_id: string }>(allIds, chunk => supabase.from('plan_exercise_skips').select('plan_exercise_id').in('plan_exercise_id', chunk)),
    ])
    const recordedIds = new Set(recorded.map(r => r.plan_exercise_id))
    const skippedIds = new Set(skips.map(r => r.plan_exercise_id))
    for (const [planId, ids] of exercisesByPlan) progressByPlan.set(planId, weekProgress(ids, recordedIds, skippedIds))
  }

  const rows: TraineeRow[] = linkRows.map(l => {
    const plan = planByLink.get(l.id) ?? null
    const invite = l.status === 'invited' ? inviteByLink.get(l.id) ?? null : null
    const lastTrainedOn = l.trainee_id ? lastByUser.get(l.trainee_id) ?? null : null
    return {
      linkId: l.id,
      traineeId: l.trainee_id,
      name: l.trainee_display_name,
      status: l.status,
      isSelf: l.trainee_id === l.trainer_id,
      startedAt: l.started_at,
      endedAt: l.ended_at,
      plan: plan ? { id: plan.id, name: plan.name, currentWeek: plan.current_week, totalWeeks: plan.total_weeks, status: plan.status } : null,
      progress: plan ? progressByPlan.get(plan.id) ?? null : null,
      lastTrainedOn,
      alerts: l.trainee_id === l.trainer_id
        ? []
        : traineeAlerts({ status: l.status, startedAt: l.started_at, lastTrainedOn, oneRmSets: l.trainee_id ? oneRmByUser.get(l.trainee_id) ?? [] : [], today: now }),
      invite: invite ? { code: invite.code, expiresAt: invite.expires_at, expired: new Date(invite.expires_at) <= now } : null,
    }
  })

  // 自分 → 契約中・一時停止・招待中（アラートのある人を先に）→ 契約終了（グレーで一番下）
  return rows.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if ((a.alerts.length > 0) !== (b.alerts.length > 0)) return a.alerts.length > 0 ? -1 : 1
    return a.name.localeCompare(b.name, 'ja')
  })
}

const SLOT_LABELS = new Map([...BASE_CATEGORIES_BY_RANK.values(), LEG_DEFAULT_CATEGORY].map(c => [c.id, c.label]))

export type TraineeDetail = {
  sessions: { id: string; trainedOn: string; exercises: { name: string; sets: { weightKg: number; reps: number; isWarmup: boolean }[] }[] }[]
  bests: { name: string; weightKg: number; reps: number }[]
  oneRms: { label: string; oneRmKg: number; recordedAt: string }[]
}

type SessionDetailRow = {
  id: string
  trained_at: string
  training_sets: { set_number: number; weight_kg: number; reps: number; is_warmup: boolean; exercise_id: string; user_exercises: { custom_name: string | null; exercise_master: { name: string } | null } | null }[]
}

// 詳細: 見える範囲（契約期間内）の直近の記録20件と、契約中なら自己ベスト・1RM（RLSで契約中のみ読める）
export async function loadTraineeDetail(supabase: SupabaseClient, traineeId: string): Promise<TraineeDetail> {
  const [{ data: sessions }, { data: bests }, { data: oneRms }] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('id, trained_at, training_sets(set_number, weight_kg, reps, is_warmup, exercise_id, user_exercises(custom_name, exercise_master(name)))')
      .eq('user_id', traineeId)
      .order('trained_at', { ascending: false })
      .limit(20),
    supabase.from('exercise_bests').select('exercise_id, best_weight_kg, best_reps').eq('user_id', traineeId),
    supabase.from('user_slot_one_rms').select('slot_id, one_rm_kg, recorded_at').eq('user_id', traineeId).order('recorded_at', { ascending: false }),
  ])

  const bestIds = (bests ?? []).map(b => b.exercise_id as string)
  const { data: bestNames } = bestIds.length > 0
    ? await supabase.from('user_exercises').select('id, custom_name, exercise_master(name)').in('id', bestIds)
    : { data: [] }
  const nameById = new Map(((bestNames ?? []) as unknown as { id: string; custom_name: string | null; exercise_master: { name: string } | null }[])
    .map(e => [e.id, e.exercise_master?.name ?? e.custom_name ?? '']))

  const latestOneRm = new Map<string, { one_rm_kg: number; recorded_at: string }>()
  for (const r of oneRms ?? []) if (!latestOneRm.has(r.slot_id)) latestOneRm.set(r.slot_id, r)

  return {
    sessions: ((sessions ?? []) as unknown as SessionDetailRow[]).map(s => {
      const byExercise = new Map<string, { name: string; sets: { setNumber: number; weightKg: number; reps: number; isWarmup: boolean }[] }>()
      for (const t of s.training_sets) {
        const entry = byExercise.get(t.exercise_id) ?? { name: t.user_exercises?.exercise_master?.name ?? t.user_exercises?.custom_name ?? '', sets: [] }
        entry.sets.push({ setNumber: t.set_number, weightKg: Number(t.weight_kg), reps: t.reps, isWarmup: t.is_warmup })
        byExercise.set(t.exercise_id, entry)
      }
      return {
        id: s.id,
        trainedOn: s.trained_at,
        exercises: [...byExercise.values()].map(e => ({
          name: e.name,
          sets: e.sets.sort((a, b) => a.setNumber - b.setNumber).map(({ weightKg, reps, isWarmup }) => ({ weightKg, reps, isWarmup })),
        })),
      }
    }),
    bests: (bests ?? [])
      .map(b => ({ name: nameById.get(b.exercise_id as string) ?? '', weightKg: Number(b.best_weight_kg), reps: b.best_reps as number }))
      .filter(b => b.name && b.weightKg > 0)
      .sort((a, b) => b.weightKg - a.weightKg),
    oneRms: [...latestOneRm.entries()].map(([slotId, r]) => ({ label: SLOT_LABELS.get(slotId) ?? slotId, oneRmKg: Number(r.one_rm_kg), recordedAt: r.recorded_at })),
  }
}
