import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateEditor, { type EditorDay } from '../../programs/[id]/TemplateEditor'
import { toEditorExercises, type PlanExerciseRow } from '@/lib/trainer/templateEditor'
import { loadTemplateCatalog } from '@/lib/trainer/templateCatalog'

type DayRow = { id: string; week_number: number; day_number: number; label: string | null; plan_exercises: PlanExerciseRow[] }
type PlanRow = {
  id: string; name: string; total_weeks: number; current_week: number; status: string; link_id: string | null; updated_at: string
  trainer_trainee_links: { trainee_display_name: string; status: string; trainee_id: string | null; trainer_id: string } | null
}

// 契約中のクライアントのプランを途中で変える（2026-11-09 オーナー決定）。テンプレートの編集画面を「保存する」で反映する形で使う。
// 変えられるのは今の週から後だけ。今の週で記録した・スキップした種目は変えない（DB の replace_client_plan_days も同じ）
export default async function ClientPlanEditorPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data } = await supabase
    .from('coaching_plans')
    .select('id, name, total_weeks, current_week, status, link_id, updated_at, trainer_trainee_links(trainee_display_name, status, trainee_id, trainer_id)')
    .eq('id', planId)
    .maybeSingle()
  const plan = data as unknown as PlanRow | null
  const link = plan?.trainer_trainee_links
  if (!plan || !plan.link_id || !link || link.status !== 'active' || link.trainee_id === link.trainer_id || !['shared', 'active'].includes(plan.status)) notFound()

  const [{ data: days }, catalog] = await Promise.all([
    supabase
      .from('plan_days')
      .select(`id, week_number, day_number, label,
        plan_exercises(id, sort_order, note, exercise_master_id, trainer_exercise_id, cardio_master_id, target_duration_seconds, target_distance_km,
          exercise_master(name, target_muscle), trainer_exercises(name, target_muscle), cardio_master(name),
          plan_sets(set_number, target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup))`)
      .eq('plan_id', planId)
      .gte('week_number', plan.current_week)
      .order('week_number')
      .order('day_number'),
    loadTemplateCatalog(supabase, user.id),
  ])
  const dayRows = (days ?? []) as unknown as DayRow[]

  // 今の週で記録した・スキップした種目
  const currentIds = dayRows.filter(d => d.week_number === plan.current_week).flatMap(d => d.plan_exercises.map(pe => pe.id!))
  const [{ data: recorded }, { data: skipped }] = currentIds.length > 0
    ? await Promise.all([
        supabase.from('training_sets').select('plan_exercise_id').in('plan_exercise_id', currentIds),
        supabase.from('plan_exercise_skips').select('plan_exercise_id').in('plan_exercise_id', currentIds),
      ])
    : [{ data: [] }, { data: [] }]
  const recordedIds = new Set((recorded ?? []).map(r => r.plan_exercise_id as string))
  const skippedIds = new Set((skipped ?? []).map(r => r.plan_exercise_id as string))

  const locked: Record<string, { name: string; status: string }[]> = {}
  const editorDays: EditorDay[] = dayRows.map(d => {
    const isLocked = (pe: PlanExerciseRow) => !!pe.id && (recordedIds.has(pe.id) || skippedIds.has(pe.id))
    const lockedRows = [...d.plan_exercises].sort((a, b) => a.sort_order - b.sort_order).filter(isLocked)
    if (lockedRows.length > 0) {
      locked[d.id] = lockedRows.map(pe => ({
        name: pe.exercise_master?.name ?? pe.trainer_exercises?.name ?? pe.cardio_master?.name ?? '種目',
        status: recordedIds.has(pe.id!) ? '記録済み' : 'スキップ',
      }))
    }
    return {
      id: d.id,
      weekNumber: d.week_number,
      dayNumber: d.day_number,
      label: d.label,
      exercises: toEditorExercises(d.plan_exercises.filter(pe => !isLocked(pe))),
    }
  })

  return (
    <TemplateEditor
      // 保存した後に読み込み直したら、新しい行の ID で編集し直す（保存するとプランの updated_at が変わる）
      key={plan.updated_at}
      planId={plan.id}
      initialName={plan.name}
      totalWeeks={plan.total_weeks}
      days={editorDays}
      catalog={catalog ?? []}
      client={{ clientName: link.trainee_display_name, currentWeek: plan.current_week, backHref: `/trainer?id=${plan.link_id}&tab=plan`, locked }}
    />
  )
}
