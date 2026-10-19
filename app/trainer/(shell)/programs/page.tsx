import { createClient } from '@/lib/supabase/server'
import TemplateList, { type TemplateSummary } from './TemplateList'

type TemplateRow = {
  id: string
  name: string
  total_weeks: number
  updated_at: string
  plan_days: { day_number: number; week_number: number }[]
}

// プログラム（テンプレート）一覧。テンプレート = link_id が null の coaching_plans（RLSで自分の分だけ読める）。
export default async function TrainerProgramsPage() {
  const supabase = await createClient()

  const [{ data: templates }, { data: shared }] = await Promise.all([
    supabase
      .from('coaching_plans')
      .select('id, name, total_weeks, updated_at, plan_days(day_number, week_number)')
      .is('link_id', null)
      .order('updated_at', { ascending: false }),
    supabase.from('coaching_plans').select('based_on_plan_id').not('link_id', 'is', null),
  ])

  const usage = new Map<string, number>()
  for (const p of shared ?? []) {
    if (p.based_on_plan_id) usage.set(p.based_on_plan_id, (usage.get(p.based_on_plan_id) ?? 0) + 1)
  }

  const summaries: TemplateSummary[] = ((templates ?? []) as TemplateRow[]).map(t => ({
    id: t.id,
    name: t.name,
    totalWeeks: t.total_weeks,
    daysPerWeek: Math.max(0, ...t.plan_days.filter(d => d.week_number === 1).map(d => d.day_number)),
    traineeCount: usage.get(t.id) ?? 0,
    updatedAt: t.updated_at,
  }))

  return <TemplateList templates={summaries} />
}
