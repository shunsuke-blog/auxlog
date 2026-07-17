import { createClient } from '@/lib/supabase/server'
import { buildProgramSuggestion } from '@/lib/suggest/program_engine'
import { normalizeExercises } from '@/lib/normalize/exercises'
import { userExercisesQuery } from '@/lib/api/queries'
import { NextResponse } from 'next/server'
import type {
  UserProgramEnrollment,
  ProgramSlot,
  ProgramWeeklyParams,
  MovementPatternWeeklyParams,
  UserSlotAssignment,
  UserSlotOneRm,
  TrainingSet,
} from '@/types'

const VALID_DAY_NUMBERS = new Set([1, 2, 3, 4])

export async function GET(request: Request) {
  const supabase = await createClient(request)
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

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 14)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]

  // 並列取得: スロット・週次パラメータ・movement_pattern週次パラメータ・割り当て・種目・1RM・直近セッション
  // （直近セッションはenrollment/assignmentsに依存しないため、ここで同時に取得して
  // ラウンドトリップを1回減らす。2026-07-10、ホーム画面の体感速度改善）
  const [slotsRes, paramsRes, movementParamsRes, assignmentsRes, exercisesRes, oneRmsRes, recentSessionsRes] = await Promise.all([
    supabase
      .from('program_slots')
      .select('*')
      .eq('program_id', enrollment.program_id)
      .order('sort_order'),
    // tier別漸進レバー（program_engine.ts）が週1の値を「セット数固定」の基準として
    // 参照するため、現在週だけでなく全9週分を取得する。
    supabase
      .from('program_weekly_params')
      .select('*')
      .eq('program_id', enrollment.program_id),
    // 1RM管理種目の%RM進行データ（movement_pattern単位、全9週分。2026-07-15新設）。
    supabase
      .from('movement_pattern_weekly_params')
      .select('*')
      .eq('program_id', enrollment.program_id),
    supabase
      .from('user_slot_assignments')
      .select('*')
      .eq('enrollment_id', enrollment.id)
      .eq('is_hidden', false),
    userExercisesQuery(supabase, user.id),
    supabase
      .from('user_slot_one_rms')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false }),
    // 1回の記録保存ごとにtraining_sessions行が1件作られる（種目単位でスロットカードから
    // 個別に保存するUXのため、1トレーニング日で種目数分の行ができうる）。件数で打ち切ると
    // 直近14日分でも30件を超えて古い方から漏れることがあるため、日付範囲だけで絞り込む
    // （2026-07-11、トライセプスプレスダウンの重量が引き継がれないバグの修正）。
    // trained_atは種目ごとに「直近14日内で最新の1セッション」を特定するために使う
    // （2026-07-17、複数トレーニング日の記録がプールされてセット単位の重量提案が
    // 破綻していた問題の修正）。
    supabase
      .from('training_sessions')
      .select('id, trained_at')
      .eq('user_id', user.id)
      .gte('trained_at', cutoffStr),
  ])

  if (slotsRes.error || paramsRes.error || movementParamsRes.error || assignmentsRes.error) {
    return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 })
  }

  // 最新の1RMのみ（スロットごと先頭1件）
  const latestOneRms = new Map<string, UserSlotOneRm>()
  for (const orm of (oneRmsRes.data ?? [])) {
    if (!latestOneRms.has(orm.slot_id)) {
      latestOneRms.set(orm.slot_id, orm as UserSlotOneRm)
    }
  }

  // アイソレーション重量キャリブレーション用: 種目ごとに直近14日以内で最新の1セッションのみを採用する
  // （以前は14日分の複数トレーニング日をまとめてプールしていたため、ドロップセット等
  // セットごとに重量が異なる構成が複数日の記録と混ざり、セット単位の重量提案が破綻していた。
  // 2026-07-17修正）
  const exerciseIds = (assignmentsRes.data ?? []).map(a => a.exercise_id)
  const recentSetsByExercise: Record<string, TrainingSet[]> = {}

  if (exerciseIds.length > 0) {
    const sessions = recentSessionsRes.data ?? []
    const sessionIds = sessions.map(s => s.id)
    if (sessionIds.length > 0) {
      const trainedAtBySessionId = new Map(sessions.map(s => [s.id, s.trained_at]))

      const { data: recentSets } = await supabase
        .from('training_sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .in('session_id', sessionIds)
        .eq('is_warmup', false)

      // 種目ごとに trained_at が最も新しいセッションだけを特定する
      const latestSessionIdByExercise = new Map<string, string>()
      for (const set of (recentSets ?? [])) {
        const trainedAt = trainedAtBySessionId.get(set.session_id) ?? ''
        const currentLatestId = latestSessionIdByExercise.get(set.exercise_id)
        const currentLatestTrainedAt = currentLatestId ? (trainedAtBySessionId.get(currentLatestId) ?? '') : ''
        if (!currentLatestId || trainedAt > currentLatestTrainedAt) {
          latestSessionIdByExercise.set(set.exercise_id, set.session_id)
        }
      }

      for (const set of (recentSets ?? [])) {
        if (latestSessionIdByExercise.get(set.exercise_id) !== set.session_id) continue
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
    movement_pattern_weekly_params: (movementParamsRes.data ?? []) as MovementPatternWeeklyParams[],
    assignments: (assignmentsRes.data ?? []) as UserSlotAssignment[],
    exercises: normalizedExercises,
    one_rms: Array.from(latestOneRms.values()),
    recent_sets_by_exercise: recentSetsByExercise,
  })

  return NextResponse.json({ suggestion })
}
