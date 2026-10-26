import { createClient } from '@/lib/supabase/server'
import TemplateList, { type TeamTemplate, type TemplateSummary } from './TemplateList'
import { getTeamContext } from '@/lib/trainer/team'

type TemplateRow = {
  id: string
  name: string
  total_weeks: number
  updated_at: string
  source: 'engine' | 'template' | 'blank'
  generation_inputs: TemplateSummary['inputs']
  plan_days: { day_number: number; week_number: number }[]
}

// プログラム（テンプレート）一覧。テンプレート = link_id が null の coaching_plans。
// チームの管理者はメンバーのテンプレートも RLS で読めるため、自分のものに絞る。メンバーには管理者のテンプレートを別に出す。
export default async function TrainerProgramsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const team = await getTeamContext(supabase, user.id)

  const [{ data: templates }, { data: shared }, { data: teamRows }] = await Promise.all([
    supabase
      .from('coaching_plans')
      .select('id, name, total_weeks, updated_at, source, generation_inputs, plan_days(day_number, week_number)')
      .is('link_id', null)
      .eq('trainer_id', user.id)
      // 日数を出すだけなので Week 1 の Day だけ読む（全週は読まない、レビュー対応 M5）
      .eq('plan_days.week_number', 1)
      .order('updated_at', { ascending: false }),
    // そのテンプレートから共有したプランのうち、進行中（共有済み・開始済み）で契約が続いているもの
    supabase
      .from('coaching_plans')
      .select('based_on_plan_id, status, current_week, total_weeks, link_id, trainer_trainee_links(trainee_display_name, status)')
      .not('link_id', 'is', null)
      .eq('trainer_id', user.id)
      .in('status', ['shared', 'active']),
    team.role === 'member' && team.active
      ? supabase
        .from('coaching_plans')
        .select('id, name, total_weeks, plan_days(day_number, week_number)')
        .is('link_id', null)
        .eq('trainer_id', team.ownerId)
        .eq('plan_days.week_number', 1)
        .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
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

  const teamTemplates: TeamTemplate[] = ((teamRows ?? []) as { id: string; name: string; total_weeks: number; plan_days: { day_number: number }[] }[]).map(t => ({
    id: t.id,
    name: t.name,
    totalWeeks: t.total_weeks,
    daysPerWeek: Math.max(0, ...t.plan_days.map(d => d.day_number)),
  }))

  return (
    <TemplateList
      templates={summaries}
      initialCreating={(await searchParams).create === '1'}
      teamTemplates={teamTemplates}
      teamName={team.role === 'member' ? team.orgName : undefined}
    />
  )
}
