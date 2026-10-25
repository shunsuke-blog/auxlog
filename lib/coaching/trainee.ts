import type { SupabaseClient } from '@supabase/supabase-js'

// トレーニー側のコーチングモードのデータ読み込み。すべてトレーニー本人のセッション（RLS）で読む。
// プランを読めるのは契約中（active）で、共有済み・開始済みのプランだけ（can_read_plan）。

export type TraineeLink = {
  linkId: string
  trainerId: string
  trainerName: string
  status: 'active' | 'paused'
  startedAt: string
}

export type LivePlan = {
  id: string
  name: string
  status: 'shared' | 'active'
  totalWeeks: number
  currentWeek: number
  /** 開始日（招待コードの入力時にトレーニーが選んだ日。無ければ最初に記録した日） */
  startDate: string | null
  /** 週ごとのフェーズ（V/I/D/M）。白紙から作成したプランは null */
  weekPhases: string[] | null
  /** 作成時の条件（時間・重点部位など）。プログラムタブの表示に使う */
  generationInputs: Record<string, unknown> | null
}

export type CoachingSet = {
  setNumber: number
  weightKg: number | null
  pct1rm: number | null
  reps: number
  rir: number | null
  isWarmup: boolean
}

export type CoachingExercise = {
  planExerciseId: string
  name: string
  isBodyweight: boolean
  note: string | null
  sets: CoachingSet[]
  recorded: boolean
  skipped: boolean
}

export type CoachingDay = {
  planDayId: string
  dayNumber: number
  label: string | null
  exercises: CoachingExercise[]
}

/** トレーナー自身との契約を除いた、契約中・一時停止中の契約（トレーニーは同時に1件まで） */
export async function getTraineeLink(supabase: SupabaseClient, userId: string): Promise<TraineeLink | null> {
  const { data } = await supabase
    .from('trainer_trainee_links')
    .select('id, trainer_id, status, started_at')
    .eq('trainee_id', userId)
    .neq('trainer_id', userId)
    .in('status', ['active', 'paused'])
    .maybeSingle()
  if (!data) return null
  const { data: profile } = await supabase
    .from('trainer_profiles')
    .select('display_name')
    .eq('user_id', data.trainer_id)
    .maybeSingle()
  return {
    linkId: data.id,
    trainerId: data.trainer_id,
    trainerName: profile?.display_name ?? 'トレーナー',
    status: data.status,
    startedAt: data.started_at,
  }
}

export async function getLivePlan(supabase: SupabaseClient, linkId: string): Promise<LivePlan | null> {
  const { data } = await supabase
    .from('coaching_plans')
    .select('id, name, status, total_weeks, current_week, start_date, started_at, generation_inputs')
    .eq('link_id', linkId)
    .in('status', ['shared', 'active'])
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    totalWeeks: data.total_weeks,
    currentWeek: data.current_week,
    startDate: data.start_date ?? (data.started_at ? String(data.started_at).slice(0, 10) : null),
    weekPhases: Array.isArray(data.generation_inputs?.week_phases) ? data.generation_inputs.week_phases : null,
    generationInputs: data.generation_inputs ?? null,
  }
}

type ExerciseRef = { name: string; is_bodyweight: boolean | null } | null
type PlanExerciseRow = {
  id: string
  sort_order: number
  note: string | null
  exercise_master: ExerciseRef
  trainer_exercises: ExerciseRef
  plan_sets: { set_number: number; target_weight_kg: number | null; target_pct_1rm: number | null; target_reps: number; target_rir: number | null; is_warmup: boolean }[]
}
type PlanDayRow = { id: string; day_number: number; label: string | null; plan_exercises: PlanExerciseRow[] }

/** その週の Day ごとの種目・目標セット・記録済み/スキップ済み */
export async function loadCoachingWeek(supabase: SupabaseClient, planId: string, week: number): Promise<CoachingDay[]> {
  const { data } = await supabase
    .from('plan_days')
    .select('id, day_number, label, plan_exercises(id, sort_order, note, exercise_master(name, is_bodyweight), trainer_exercises(name, is_bodyweight), plan_sets(set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup))')
    .eq('plan_id', planId)
    .eq('week_number', week)
    .order('day_number')
  const days = (data ?? []) as unknown as PlanDayRow[]

  const exerciseIds = days.flatMap(d => d.plan_exercises.map(e => e.id))
  const [{ data: recorded }, { data: skipped }] = exerciseIds.length > 0
    ? await Promise.all([
        supabase.from('training_sets').select('plan_exercise_id').in('plan_exercise_id', exerciseIds),
        supabase.from('plan_exercise_skips').select('plan_exercise_id').in('plan_exercise_id', exerciseIds),
      ])
    : [{ data: [] }, { data: [] }]
  const recordedIds = new Set((recorded ?? []).map(r => r.plan_exercise_id as string))
  const skippedIds = new Set((skipped ?? []).map(r => r.plan_exercise_id as string))

  return days.map(d => ({
    planDayId: d.id,
    dayNumber: d.day_number,
    label: d.label,
    exercises: [...d.plan_exercises]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(e => {
        const ref = e.exercise_master ?? e.trainer_exercises
        return {
          planExerciseId: e.id,
          name: ref?.name ?? '種目',
          isBodyweight: ref?.is_bodyweight ?? false,
          note: e.note,
          sets: [...e.plan_sets]
            .sort((a, b) => a.set_number - b.set_number)
            .map(s => ({
              setNumber: s.set_number,
              weightKg: s.target_weight_kg == null ? null : Number(s.target_weight_kg),
              pct1rm: s.target_pct_1rm == null ? null : Number(s.target_pct_1rm),
              reps: s.target_reps,
              rir: s.target_rir,
              isWarmup: s.is_warmup,
            })),
          recorded: recordedIds.has(e.id),
          skipped: skippedIds.has(e.id),
        }
      }),
  }))
}

/** その週の全種目が記録済みかスキップ済みか（「次の週へ」を出す条件、セルフモードと同じ） */
export function isWeekComplete(days: CoachingDay[]): boolean {
  const all = days.flatMap(d => d.exercises)
  return all.length > 0 && all.every(e => e.recorded || e.skipped)
}

/**
 * 目標セットを、アプリと同じ形にまとめて表示する（2026-10-25）。
 * - ウォームアップは1行（「40kg×5 · 60kg×3」）
 * - 同じ重量・回数が続くセットは「3セット」にまとめる。最初のセットだけ違う時は「メイン」
 * - RIR（努力度）は出さない（重量が決まっている種目は不要、自動の種目はコメントで平易な言葉にする）
 * - 時間で行う種目（プランク（秒））は回数を秒として出す
 */
export function condenseTargetSets(ex: Pick<CoachingExercise, 'sets' | 'isBodyweight' | 'name'>): { label: string; text: string }[] {
  const unit = ex.name.includes('（秒）') ? '秒' : '回'
  const weight = (s: CoachingSet) => (s.weightKg != null ? `${s.weightKg}kg` : ex.isBodyweight ? '自重' : '前回から')
  const rows: { label: string; text: string }[] = []
  const warmups = ex.sets.filter(s => s.isWarmup)
  if (warmups.length > 0) rows.push({ label: 'ウォーム', text: warmups.map(s => `${weight(s)}×${s.reps}`).join(' · ') })

  const groups: { set: CoachingSet; count: number }[] = []
  for (const s of ex.sets.filter(x => !x.isWarmup)) {
    const last = groups[groups.length - 1]
    if (last && last.set.weightKg === s.weightKg && last.set.reps === s.reps) last.count++
    else groups.push({ set: s, count: 1 })
  }
  groups.forEach((g, i) => {
    const label = i === 0 && g.count === 1 && groups.length > 1 ? 'メイン' : `${g.count}セット`
    rows.push({ label, text: `${weight(g.set)} × ${g.set.reps}${unit}` })
  })
  return rows
}

// ── プログラムタブ（閲覧のみ）の情報。アプリのプログラムタブ（プログラム情報・種目情報）と同じ内容 ──

export type PlanOverview = {
  daysPerWeek: number
  sessionMinutes: 60 | 75 | 90 | null
  priorityMuscles: string[]
  /** 今週の Day ごとの種目と1RM（1RMはトレーナーの入力、または初回の記録からの推定。%1RM と重量から逆算） */
  days: { dayNumber: number; label: string | null; exercises: { name: string; oneRmKg: number | null }[] }[]
  /** 使用重量の推移（このプランで記録した週ごとの最大重量。重量のある種目だけ） */
  weightHistory: { slotId: string; exerciseName: string; data: { week: number; maxWeight: number }[] }[]
}

type OverviewExerciseRow = {
  id: string
  exercise_master_id: string | null
  trainer_exercise_id: string | null
  sort_order: number
  exercise_master: { name: string } | null
  trainer_exercises: { name: string } | null
  plan_sets: { target_pct_1rm: number | string | null; target_weight_kg: number | string | null }[]
}
type OverviewDayRow = { week_number: number; day_number: number; label: string | null; plan_exercises: OverviewExerciseRow[] }

export async function loadPlanOverview(supabase: SupabaseClient, plan: LivePlan): Promise<PlanOverview> {
  const generationInputs = plan.generationInputs
  const { data } = await supabase
    .from('plan_days')
    .select('week_number, day_number, label, plan_exercises(id, exercise_master_id, trainer_exercise_id, sort_order, exercise_master(name), trainer_exercises(name), plan_sets(target_pct_1rm, target_weight_kg))')
    .eq('plan_id', plan.id)
  const days = (data ?? []) as unknown as OverviewDayRow[]
  const exKey = (e: Pick<OverviewExerciseRow, 'exercise_master_id' | 'trainer_exercise_id'>) => e.exercise_master_id ?? e.trainer_exercise_id ?? ''
  const nameOf = (e: OverviewExerciseRow) => e.exercise_master?.name ?? e.trainer_exercises?.name ?? '種目'

  // 1RM: %1RM のセットに重量が入っていれば、重量 ÷ % で逆算する（トレーナーの入力・初回の記録からの推定のどちらでも同じ）
  const oneRmByExercise = new Map<string, number>()
  for (const d of days) for (const e of d.plan_exercises) for (const s of e.plan_sets) {
    const pct = s.target_pct_1rm == null ? null : Number(s.target_pct_1rm)
    const kg = s.target_weight_kg == null ? null : Number(s.target_weight_kg)
    if (pct && kg && !oneRmByExercise.has(exKey(e))) oneRmByExercise.set(exKey(e), Math.round(kg / pct))
  }

  const currentDays = days
    .filter(d => d.week_number === plan.currentWeek)
    .sort((a, b) => a.day_number - b.day_number)
    .map(d => ({
      dayNumber: d.day_number,
      label: d.label,
      exercises: [...d.plan_exercises].sort((a, b) => a.sort_order - b.sort_order)
        .map(e => ({ name: nameOf(e), oneRmKg: oneRmByExercise.get(exKey(e)) ?? null })),
    }))

  // 使用重量の推移: このプランの種目に紐付いた記録の、週ごとの最大重量
  const weekOf = new Map<string, number>()
  const exerciseOf = new Map<string, { key: string; name: string }>()
  for (const d of days) for (const e of d.plan_exercises) {
    weekOf.set(e.id, d.week_number)
    exerciseOf.set(e.id, { key: exKey(e), name: nameOf(e) })
  }
  const ids = [...weekOf.keys()]
  const { data: sets } = ids.length > 0
    // 種目IDの一覧を URL に並べず、結合でプランを条件にする（件数が多いと HTTP 400 になるため、2026-10-25 レビュー対応 H1）
    ? await supabase
        .from('training_sets')
        .select('plan_exercise_id, weight_kg, is_warmup, plan_exercises!inner(plan_days!inner(plan_id))')
        .eq('plan_exercises.plan_days.plan_id', plan.id)
    : { data: [] }
  const history = new Map<string, { name: string; byWeek: Map<number, number> }>()
  for (const s of (sets ?? []) as { plan_exercise_id: string; weight_kg: number; is_warmup: boolean }[]) {
    const w = Number(s.weight_kg)
    if (s.is_warmup || !(w > 0)) continue
    const ex = exerciseOf.get(s.plan_exercise_id)
    const week = weekOf.get(s.plan_exercise_id)
    if (!ex || week == null) continue
    const h = history.get(ex.key) ?? { name: ex.name, byWeek: new Map<number, number>() }
    h.byWeek.set(week, Math.max(h.byWeek.get(week) ?? 0, w))
    history.set(ex.key, h)
  }
  const weightHistory = [...history.entries()].map(([key, h]) => ({
    slotId: key,
    exerciseName: h.name,
    data: [...h.byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, maxWeight]) => ({ week, maxWeight })),
  }))

  const minutes = generationInputs?.session_minutes
  return {
    daysPerWeek: new Set(days.filter(d => d.week_number === 1).map(d => d.day_number)).size,
    sessionMinutes: minutes === 60 || minutes === 75 || minutes === 90 ? minutes : null,
    priorityMuscles: Array.isArray(generationInputs?.priority_muscles) ? (generationInputs.priority_muscles as string[]) : [],
    days: currentDays,
    weightHistory,
  }
}

/**
 * 進行中のプランの種目に対応する、トレーニー自身の種目（user_exercises）の ID。
 * 履歴のグラフの種目選択を「今のプログラムの種目」に絞るのに使う（セルフモードのスロット割り当てと同じ役割、2026-10-25）
 */
export async function planUserExerciseIds(supabase: SupabaseClient, userId: string, planId: string): Promise<string[]> {
  const { data: rows } = await supabase
    .from('plan_exercises')
    .select('exercise_master_id, trainer_exercise_id, plan_days!inner(plan_id)')
    .eq('plan_days.plan_id', planId)
  const masterIds = [...new Set((rows ?? []).map(r => r.exercise_master_id as string | null).filter((id): id is string => !!id))]
  const trainerIds = [...new Set((rows ?? []).map(r => r.trainer_exercise_id as string | null).filter((id): id is string => !!id))]
  const filters = [
    ...(masterIds.length > 0 ? [`exercise_master_id.in.(${masterIds.join(',')})`] : []),
    ...(trainerIds.length > 0 ? [`trainer_exercise_id.in.(${trainerIds.join(',')})`] : []),
  ]
  if (filters.length === 0) return []
  const { data: own } = await supabase.from('user_exercises').select('id').eq('user_id', userId).or(filters.join(','))
  return (own ?? []).map(e => e.id as string)
}

/** プラン外の種目の記録（コーチングモードのホームの「種目を追加」から記録したもの） */
export type OffPlanRecord = { exerciseId: string; name: string; trainedOn: string; sets: string }

/**
 * その期間の、プランの種目に紐付いていない記録（種目ごと・日ごと）。コーチングモードのホームで今週分を出す（2026-10-25）。
 * 自分の記録だけを読む（トレーナーが自分の画面で読む時は can_trainer_view で契約期間内だけ）
 */
export async function loadOffPlanRecords(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<OffPlanRecord[]> {
  const { data } = await supabase
    .from('training_sets')
    .select('exercise_id, set_number, weight_kg, reps, is_warmup, training_sessions!inner(user_id, trained_at), user_exercises(custom_name, exercise_master(name))')
    .eq('training_sessions.user_id', userId)
    .gte('training_sessions.trained_at', from)
    .lte('training_sessions.trained_at', to)
    .is('plan_exercise_id', null)
  type Row = { exercise_id: string; set_number: number; weight_kg: number | string; reps: number; is_warmup: boolean; training_sessions: { trained_at: string }; user_exercises: { custom_name: string | null; exercise_master: { name: string } | null } | null }
  const byKey = new Map<string, { exerciseId: string; name: string; trainedOn: string; sets: Row[] }>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const key = `${r.exercise_id}:${r.training_sessions.trained_at}`
    const entry = byKey.get(key) ?? { exerciseId: r.exercise_id, name: r.user_exercises?.exercise_master?.name ?? r.user_exercises?.custom_name ?? '種目', trainedOn: r.training_sessions.trained_at, sets: [] }
    entry.sets.push(r)
    byKey.set(key, entry)
  }
  return [...byKey.values()]
    .sort((a, b) => b.trainedOn.localeCompare(a.trainedOn))
    .map(e => ({
      exerciseId: e.exerciseId,
      name: e.name,
      trainedOn: e.trainedOn,
      sets: e.sets.filter(s => !s.is_warmup).sort((a, b) => a.set_number - b.set_number).map(s => `${Number(s.weight_kg)}kg×${s.reps}`).join(' / '),
    }))
}
