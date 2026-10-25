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
