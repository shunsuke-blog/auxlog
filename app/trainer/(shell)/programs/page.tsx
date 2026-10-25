import { createClient } from '@/lib/supabase/server'
import TemplateList, { type TemplateSummary } from './TemplateList'

type TemplateRow = {
  id: string
  name: string
  total_weeks: number
  updated_at: string
  source: 'engine' | 'template' | 'blank'
  generation_inputs: TemplateSummary['inputs']
  plan_days: { day_number: number; week_number: number }[]
}

// プログラム（テンプレート）一覧。テンプレート = link_id が null の coaching_plans（RLSで自分の分だけ読める）。
export default async function TrainerProgramsPage() {
  const supabase = await createClient()

  const [{ data: templates }, { data: shared }] = await Promise.all([
    supabase
      .from('coaching_plans')
      .select('id, name, total_weeks, updated_at, source, generation_inputs, plan_days(day_number, week_number)')
      .is('link_id', null)
      // 日数を出すだけなので Week 1 の Day だけ読む（全週は読まない、レビュー対応 M5）
      .eq('plan_days.week_number', 1)
      .order('updated_at', { ascending: false }),
    // そのテンプレートから共有したプランのうち、進行中（共有済み・開始済み）で契約が続いているもの
    supabase
      .from('coaching_plans')
      .select('based_on_plan_id, status, current_week, total_weeks, link_id, trainer_trainee_links(trainee_display_name, status)')
      .not('link_id', 'is', null)
      .in('status', ['shared', 'active']),
  ])

  type SharedRow = {
    based_on_plan_id: string | null
    status: 'shared' | 'active'
    current_week: number
    total_weeks: number
    link_id: string
    trainer_trainee_links: { trainee_display_name: string; status: 'invited' | 'active' | 'paused' | 'ended' } | null
  }
  const usage = new Map<string, TemplateSummary['trainees']>()
  for (const p of (shared ?? []) as unknown as SharedRow[]) {
    const link = p.trainer_trainee_links
    if (!p.based_on_plan_id || !link || link.status === 'ended') continue
    const list = usage.get(p.based_on_plan_id) ?? []
    list.push({ linkId: p.link_id, name: link.trainee_display_name, linkStatus: link.status, planStatus: p.status, currentWeek: p.current_week, totalWeeks: p.total_weeks })
    usage.set(p.based_on_plan_id, list)
  }

  const summaries: TemplateSummary[] = ((templates ?? []) as TemplateRow[]).map(t => ({
    id: t.id,
    name: t.name,
    totalWeeks: t.total_weeks,
    daysPerWeek: Math.max(0, ...t.plan_days.filter(d => d.week_number === 1).map(d => d.day_number)),
    traineeCount: usage.get(t.id)?.length ?? 0,
    trainees: usage.get(t.id) ?? [],
    source: t.source,
    inputs: t.generation_inputs,
    updatedAt: t.updated_at,
  }))

  return <TemplateList templates={summaries} />
}
