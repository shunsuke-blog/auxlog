import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { generateFromBaseTemplate, generateTemplate, hasBaseTemplate, MAX_GENERATED_DAYS, MAX_TEMPLATE_WEEKS, MIN_GENERATED_DAYS } from '@/lib/coaching/generate_template'
import { MAX_PRIORITY_MUSCLES, PRIORITY_MUSCLE_OPTION_ORDER } from '@/types'
import type { MovementPatternWeeklyParams, ProgramWeeklyParams } from '@/types'
import type { ExerciseMasterRow } from '@/lib/onboarding/exercise_matching'

const GenerateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  total_weeks: z.number().int().min(1).max(MAX_TEMPLATE_WEEKS),
  days_per_week: z.number().int().min(MIN_GENERATED_DAYS).max(MAX_GENERATED_DAYS),
  session_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]),
  priority_muscles: z.array(z.enum(PRIORITY_MUSCLE_OPTION_ORDER as [string, ...string[]])).max(MAX_PRIORITY_MUSCLES),
})

// 「Auxlog で作成」。既存の9週間プログラムの週次パラメータから、指定した週数・日数のテンプレートを
// 生成して保存する（ルールは lib/coaching/generate_template.ts）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = GenerateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const input = parsed.data

  const [exercisesRes, weeklyRes, movementRes] = await Promise.all([
    supabase.from('exercise_master').select('id, code, name, target_muscle, movement_pattern, requires_one_rm').order('sort_order'),
    supabase.from('program_weekly_params').select('slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, top_set_is_amrap'),
    supabase.from('movement_pattern_weekly_params').select('*'),
  ])
  if (exercisesRes.error || weeklyRes.error || movementRes.error) {
    return dbError('プログラムの元データの取得に失敗しました', exercisesRes.error ?? weeklyRes.error ?? movementRes.error)
  }

  // 週2〜4日は固定テンプレート方式（2026-10-24）、テンプレートが無い週5〜7日は従来の動的生成
  const useTemplate = hasBaseTemplate(input.days_per_week)
  const generateInput = {
    totalWeeks: input.total_weeks,
    daysPerWeek: input.days_per_week,
    sessionMinutes: input.session_minutes,
    priorities: input.priority_muscles as never,
    exercises: exercisesRes.data as (ExerciseMasterRow & { id: string; code: string })[],
    weeklyParams: weeklyRes.data as ProgramWeeklyParams[],
    movementParams: movementRes.data as MovementPatternWeeklyParams[],
  }
  const days = useTemplate ? generateFromBaseTemplate(generateInput) : generateTemplate(generateInput)

  const { data, error } = await supabase.rpc('create_generated_template', {
    p_name: input.name,
    p_total_weeks: input.total_weeks,
    p_days_per_week: input.days_per_week,
    p_generation_inputs: {
      days_per_week: input.days_per_week,
      session_minutes: input.session_minutes,
      priority_muscles: input.priority_muscles,
      method: useTemplate ? 'base_template' : 'dynamic',
    },
    p_days: days,
  })
  if (error) return trainerRpcError(error, 'テンプレートの作成に失敗しました')
  return NextResponse.json({ id: data })
}
