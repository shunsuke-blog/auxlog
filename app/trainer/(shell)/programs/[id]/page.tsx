import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateEditor, { type EditorDay } from './TemplateEditor'
import { toEditorExercises, type PlanExerciseRow } from '@/lib/trainer/templateEditor'
import { loadTemplateCatalog } from '@/lib/trainer/templateCatalog'

type DayRow = { id: string; week_number: number; day_number: number; label: string | null; plan_exercises: PlanExerciseRow[] }

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // 編集できるのは自分のテンプレートだけ（チームのテンプレートは RLS で読めても編集画面は出さない）
  const [{ data: plan }, { data: days }, catalog] = await Promise.all([
    supabase.from('coaching_plans').select('id, name, total_weeks, link_id').eq('id', id).is('link_id', null).eq('trainer_id', user.id).maybeSingle(),
    supabase
      .from('plan_days')
      .select(`id, week_number, day_number, label,
        plan_exercises(sort_order, note, exercise_master_id, trainer_exercise_id, cardio_master_id, target_duration_seconds, target_distance_km,
          exercise_master(name, target_muscle), trainer_exercises(name, target_muscle), cardio_master(name),
          plan_sets(set_number, target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup))`)
      .eq('plan_id', id)
      .order('week_number')
      .order('day_number'),
    loadTemplateCatalog(supabase, user.id),
  ])

  if (!plan) notFound()

  const editorDays: EditorDay[] = ((days ?? []) as unknown as DayRow[]).map(d => ({
    id: d.id,
    weekNumber: d.week_number,
    dayNumber: d.day_number,
    label: d.label,
    exercises: toEditorExercises(d.plan_exercises ?? []),
  }))

  return <TemplateEditor planId={plan.id} initialName={plan.name} totalWeeks={plan.total_weeks} days={editorDays} catalog={catalog ?? []} />
}
