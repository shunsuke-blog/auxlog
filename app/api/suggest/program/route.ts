import { createClient } from '@/lib/supabase/server'
import { buildProgramSuggestion } from '@/lib/suggest/program_engine'
import { normalizeExercises } from '@/lib/normalize/exercises'
import { userExercisesQuery } from '@/lib/api/queries'
import { NextResponse } from 'next/server'
import type {
  UserProgramEnrollment,
  ProgramSlot,
  ProgramWeeklyParams,
  UserSlotAssignment,
  UserSlotOneRm,
  TrainingSet,
} from '@/types'

const RECENT_SESSIONS_LIMIT = 30

const VALID_DAY_NUMBERS = new Set([1, 2, 3, 4])

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dayParam = searchParams.get('day')
  const dayNumber = dayParam ? parseInt(dayParam, 10) : 1
  if (!VALID_DAY_NUMBERS.has(dayNumber)) {
    return NextResponse.json({ error: 'day は 1〜4 で指定してください' }, { status: 400 })
  }

  // アクティブなエンロールメントを取得
  const { data: enrollment, error: enrollError } = await supabase
    .from('user_program_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (enrollError) return NextResponse.json({ error: enrollError.message }, { status: 500 })
  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // 並列取得: スロット・週次パラメータ・割り当て・種目・1RM
  const [slotsRes, paramsRes, assignmentsRes, exercisesRes, oneRmsRes] = await Promise.all([
    supabase
      .from('program_slots')
      .select('*')
      .eq('program_id', enrollment.program_id)
      .order('sort_order'),
    supabase
      .from('program_weekly_params')
      .select('*')
      .eq('program_id', enrollment.program_id)
      .eq('week_number', enrollment.current_week),
    supabase
      .from('user_slot_assignments')
      .select('*')
      .eq('enrollment_id', enrollment.id),
    userExercisesQuery(supabase, user.id),
    supabase
      .from('user_slot_one_rms')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false }),
  ])

  if (slotsRes.error || paramsRes.error || assignmentsRes.error) {
    return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 })
  }

  // 最新の1RMのみ（スロットごと先頭1件）
  const latestOneRms = new Map<string, UserSlotOneRm>()
  for (const orm of (oneRmsRes.data ?? [])) {
    if (!latestOneRms.has(orm.slot_id)) {
      latestOneRms.set(orm.slot_id, orm as UserSlotOneRm)
    }
  }

  // アイソレーション重量キャリブレーション用: 直近14日のセットを取得
  const exerciseIds = (assignmentsRes.data ?? []).map(a => a.exercise_id)
  let recentSetsByExercise: Record<string, TrainingSet[]> = {}

  if (exerciseIds.length > 0) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 14)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    const { data: recentSessions } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .gte('trained_at', cutoffStr)
      .limit(RECENT_SESSIONS_LIMIT)

    const sessionIds = (recentSessions ?? []).map(s => s.id)
    if (sessionIds.length > 0) {
      const { data: recentSets } = await supabase
        .from('training_sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .in('session_id', sessionIds)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })

      for (const set of (recentSets ?? [])) {
        if (!recentSetsByExercise[set.exercise_id]) {
          recentSetsByExercise[set.exercise_id] = []
        }
        recentSetsByExercise[set.exercise_id].push(set as TrainingSet)
      }
    }
  }

  const normalizedExercises = normalizeExercises(exercisesRes.data ?? [])

  const suggestion = buildProgramSuggestion({
    enrollment: enrollment as UserProgramEnrollment,
    day_number: dayNumber as 1 | 2 | 3 | 4,
    slots: (slotsRes.data ?? []) as ProgramSlot[],
    weekly_params: (paramsRes.data ?? []) as ProgramWeeklyParams[],
    assignments: (assignmentsRes.data ?? []) as UserSlotAssignment[],
    exercises: normalizedExercises,
    one_rms: Array.from(latestOneRms.values()),
    recent_sets_by_exercise: recentSetsByExercise,
  })

  return NextResponse.json({ suggestion })
}
