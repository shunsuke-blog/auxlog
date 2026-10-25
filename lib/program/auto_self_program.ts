import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSlotSelections, exerciseRequiresOneRm, type ExerciseMasterRow } from '@/lib/onboarding/exercise_matching'
import { buildExerciseCategories, type DaysPerWeek } from '@/lib/suggest/generate_program_composition'
import type { PriorityMuscleOption } from '@/types'
import { estimateOneRmFromSets, isUsableForEstimate } from '@/lib/coaching/one_rm'
import { createSelfEnrollment, type SelfEnrollmentInput } from './create_self_enrollment'

// トレーナーとの契約が終わったトレーニーに、セルフモードのプログラムを自動で作る（2026-10-19 決定:
// 契約中はセルフモードを作らず、契約終了時だけ作る。確認・編集の手順は挟まない）。
//   - 週の日数・時間・重点部位: 以前のセルフモードの設定。無ければプランの週の日数（2〜4日に収める）
//   - 種目: 契約中に記録した種目と以前のセルフモードの種目から選び、足りない枠は既定の種目
//   - 1RM: 契約期間の記録から推定（Epley）。記録が無い種目は以前の値（user_slot_one_rms の最新）のまま


export type AutoSelfProgramResult = 'created' | 'not_needed' | { error: string }

export async function autoCreateSelfProgramAfterContract(supabase: SupabaseClient, userId: string): Promise<AutoSelfProgramResult> {
  const { data: link } = await supabase
    .from('trainer_trainee_links')
    .select('id, started_at, ended_at')
    .eq('trainee_id', userId)
    .neq('trainer_id', userId)
    .eq('status', 'ended')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!link) return 'not_needed'

  const { data: enrollments } = await supabase
    .from('user_program_enrollments')
    .select('id, is_active, days_per_week, session_duration_minutes, priority_muscles, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  const latest = enrollments?.[0]
  // 有効なプログラムがある、または契約終了後に作り直した（＝自分で始めた／自動作成済み）なら何もしない
  if (latest && (latest.is_active || latest.created_at > link.ended_at)) return 'not_needed'

  // 契約期間の記録（種目名と1RM推定の材料）
  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('id, training_sets(weight_kg, reps, is_warmup, user_exercises(exercise_master(name)))')
    .eq('user_id', userId)
    .gte('trained_at', link.started_at.slice(0, 10))
    .lte('trained_at', link.ended_at.slice(0, 10))
  type SetRow = { weight_kg: number; reps: number; is_warmup: boolean; user_exercises: { exercise_master: { name: string } | null } | null }
  const coachingSets = ((sessions ?? []) as unknown as { training_sets: SetRow[] }[]).flatMap(s => s.training_sets)
  const bestOneRmByName = new Map<string, number>()
  for (const s of coachingSets) {
    const name = s.user_exercises?.exercise_master?.name
    if (!name || !isUsableForEstimate(s)) continue
    const est = estimateOneRmFromSets([s], 2.5)!
    if (est > (bestOneRmByName.get(name) ?? 0)) bestOneRmByName.set(name, est)
  }
  const coachingNames = new Set(coachingSets.map(s => s.user_exercises?.exercise_master?.name).filter((n): n is string => !!n))

  // 以前のセルフモードの種目
  const previousNames = new Set<string>()
  if (latest) {
    const { data: assignments } = await supabase
      .from('user_slot_assignments')
      .select('user_exercises(exercise_master(name))')
      .eq('enrollment_id', latest.id)
    for (const a of (assignments ?? []) as unknown as { user_exercises: { exercise_master: { name: string } | null } | null }[]) {
      const name = a.user_exercises?.exercise_master?.name
      if (name) previousNames.add(name)
    }
  }

  const daysPerWeek = (latest?.days_per_week ?? (await planDaysPerWeek(supabase, link.id))) as DaysPerWeek
  const priorityMuscles = ((latest?.priority_muscles ?? []) as PriorityMuscleOption[])

  // オンボーディングと同じ候補（tier<=2、tier→sort_order順）
  const { data: masterRows } = await supabase
    .from('exercise_master')
    .select('id, name, target_muscle, movement_pattern, requires_one_rm')
    .not('movement_pattern', 'is', null)
    .lte('tier', 2)
    .order('tier')
    .order('sort_order')
  const exercises = (masterRows ?? []) as ExerciseMasterRow[]
  const exerciseByName = new Map(exercises.map(e => [e.name, e]))

  const { names } = buildSlotSelections({
    daysPerWeek,
    priorityMuscles,
    exercises,
    selectedExercises: new Set([...coachingNames, ...previousNames]),
  })

  const categories = buildExerciseCategories(daysPerWeek, priorityMuscles)
  const input: SelfEnrollmentInput = {
    days_per_week: daysPerWeek,
    session_duration_minutes: (latest?.session_duration_minutes ?? 90) as 60 | 75 | 90,
    priority_muscles: priorityMuscles,
    slot_assignments: Object.entries(names).filter(([, n]) => n).map(([slot_id, exercise_name]) => ({ slot_id, exercise_name })),
    one_rms: categories.flatMap(c => {
      const name = names[c.id]
      const kg = name ? bestOneRmByName.get(name) : undefined
      if (!name || !kg || !exerciseRequiresOneRm(c, name, exerciseByName, daysPerWeek)) return []
      return [{ slot_id: c.id, one_rm_kg: kg, source: 'epley_estimated' as const }]
    }),
  }
  if (input.slot_assignments.length === 0) return { error: '種目の割り当てに失敗しました' }

  const result = await createSelfEnrollment(supabase, userId, input)
  if ('error' in result) {
    // 同時に開いた別タブが先に作った場合（有効なプログラムが既にある）は成功扱い
    if (result.status === 400) return 'not_needed'
    console.error('[auto self program]', result.error, result.cause)
    return { error: result.error }
  }
  return 'created'
}

/** 最後のプランの1週目の日数（セルフモードは週2〜4日なので収める）。契約終了後のプランは
 *  トレーニーからRLSで読めないため、日数だけを返すRPCで取る */
async function planDaysPerWeek(supabase: SupabaseClient, linkId: string): Promise<DaysPerWeek> {
  const { data } = await supabase.rpc('ended_plan_days_per_week', { p_link_id: linkId })
  const days = typeof data === 'number' && data > 0 ? data : 3
  return Math.min(4, Math.max(2, days)) as DaysPerWeek
}
