import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateEditor, { type EditorDay } from './TemplateEditor'
import { toEditorExercises, type CatalogExercise, type PlanExerciseRow } from '@/lib/trainer/templateEditor'

type DayRow = { id: string; week_number: number; day_number: number; label: string | null; plan_exercises: PlanExerciseRow[] }

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // 編集できるのは自分のテンプレートだけ（チームのテンプレートは RLS で読めても編集画面は出さない）
  const [{ data: plan }, { data: days }, { data: master }, { data: own }] = await Promise.all([
    supabase.from('coaching_plans').select('id, name, total_weeks, link_id').eq('id', id).is('link_id', null).eq('trainer_id', user.id).maybeSingle(),
    supabase
      .from('plan_days')
      .select(`id, week_number, day_number, label,
        plan_exercises(sort_order, note, exercise_master_id, trainer_exercise_id,
          exercise_master(name, target_muscle), trainer_exercises(name, target_muscle),
          plan_sets(set_number, target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup))`)
      .eq('plan_id', id)
      .order('week_number')
      .order('day_number'),
    supabase.from('exercise_master').select('id, name, target_muscle, movement_pattern, requires_one_rm').order('sort_order'),
    supabase.from('trainer_exercises').select('id, name, target_muscle').eq('trainer_id', user.id).order('created_at'),
  ])

  if (!plan) notFound()

  const editorDays: EditorDay[] = ((days ?? []) as unknown as DayRow[]).map(d => ({
    id: d.id,
    weekNumber: d.week_number,
    dayNumber: d.day_number,
    exercises: toEditorExercises(d.plan_exercises ?? []),
  }))

  const catalog: CatalogExercise[] = [
    ...(own ?? []).map(e => ({ exerciseMasterId: null, trainerExerciseId: e.id as string, name: e.name as string, targetMuscle: (e.target_muscle as string | null) ?? null })),
    ...(master ?? []).map(e => ({ exerciseMasterId: e.id as string, trainerExerciseId: null, name: e.name as string, targetMuscle: (e.target_muscle as string | null) ?? null, movementPattern: (e.movement_pattern as string | null) ?? null, requiresOneRm: e.requires_one_rm === true })),
  ]

  return <TemplateEditor planId={plan.id} initialName={plan.name} totalWeeks={plan.total_weeks} days={editorDays} catalog={catalog} />
}
