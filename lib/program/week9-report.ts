import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateOneRm } from '@/lib/utils/epley'
import { isRequiredAtMaxout, type DaysPerWeek } from '@/lib/suggest/generate_program_composition'

const todayJST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

type EnrollmentRow = {
  id: string
  user_id: string
  program_id: string
  days_per_week: number
  started_at: string
  current_week: number
}

type AssignmentRow = {
  slot_id: string
  exercise_id: string
  is_hidden: boolean
  user_exercises: {
    name: string
    custom_name: string | null
    exercise_master: { movement_pattern: string | null; requires_one_rm: boolean } | null
  } | null
}

export type OneRmGain = {
  slot_id: string
  exercise_name: string
  old_one_rm_kg: number | null
  new_one_rm_kg: number
}

export type GrowthReport = {
  cycle_started_at: string
  cycle_completed_at: string
  total_sessions: number
  total_volume_kg: number
  one_rm_gains: OneRmGain[]
}

export type Week9CompletionResult =
  | { allComplete: false }
  | { allComplete: true; newOneRms: { slot_id: string; one_rm_kg: number }[]; assignments: AssignmentRow[]; growthReport: GrowthReport }

// Week9(MaxOut)の完了判定・AMRAP実績からの新1RM推定・成長レポートの計算を1箇所にまとめる。
// growth-report(読み取り専用のプレビュー)とrenew-cycle(実際にDBを更新する側)の両方から
// 呼ばれる（2026-08-31、成長レポートを「サイクル開始の確定後」ではなく「確定前に見せる」
// UXに変更した際に、重複していた計算ロジックを一本化した）。
export async function computeWeek9Completion(
  supabase: SupabaseClient,
  user: { id: string },
  enrollment: EnrollmentRow
): Promise<Week9CompletionResult | { error: string }> {
  // Week9の開始日を計算（api/suggest/program/week-status と同じロジック）
  const weekStart = new Date(enrollment.started_at)
  weekStart.setDate(weekStart.getDate() + (enrollment.current_week - 1) * 7)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  const { data: assignments, error: assignmentsError } = await supabase
    .from('user_slot_assignments')
    .select('slot_id, exercise_id, is_hidden, user_exercises(name, custom_name, exercise_master(movement_pattern, requires_one_rm))')
    .eq('enrollment_id', enrollment.id)
    .returns<AssignmentRow[]>()

  if (assignmentsError) return { error: '種目割り当ての取得に失敗しました' }
  if (!assignments || assignments.length === 0) return { error: '種目割り当てが見つかりませんでした' }

  const { data: sessions, error: sessionsError } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', user.id)
    .gte('trained_at', weekStartStr)

  if (sessionsError) return { error: '今週のセッション取得に失敗しました' }
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id)

  let completedExerciseIds: string[] = []
  const topSetsByExercise = new Map<string, { weight_kg: number; reps: number }[]>()
  if (sessionIds.length > 0) {
    const { data: sets, error: setsError } = await supabase
      .from('training_sets')
      .select('exercise_id, set_number, weight_kg, reps')
      .in('session_id', sessionIds)
      .eq('is_warmup', false)

    if (setsError) return { error: 'セット記録の取得に失敗しました' }

    completedExerciseIds = [...new Set((sets ?? []).map((s: { exercise_id: string }) => s.exercise_id))]

    // set_number=1 がトップセット（AMRAP対象種目の全力セット）という前提
    // （program_engine.tsのbuildCompoundSetsは常にtop setを配列先頭=set_number 1として生成）。
    for (const s of sets ?? []) {
      if (s.set_number !== 1) continue
      const list = topSetsByExercise.get(s.exercise_id) ?? []
      list.push({ weight_kg: s.weight_kg, reps: s.reps })
      topSetsByExercise.set(s.exercise_id, list)
    }
  }

  // Week9はhasOneRm対象のスロットしか画面に出ない（program_engine.ts）ため、完了判定も
  // それに合わせて絞る（2026-08-27の表示側修正で生まれた回帰、2026-08-30発見）。
  const days = enrollment.days_per_week as DaysPerWeek
  const requiredExerciseIds = assignments
    .filter(a => !a.is_hidden)
    .filter(a => {
      const requiresOneRm = a.user_exercises?.custom_name
        ? false
        : (a.user_exercises?.exercise_master?.requires_one_rm ?? false)
      return isRequiredAtMaxout(a.slot_id, requiresOneRm, days)
    })
    .map(a => a.exercise_id)
  const completedSet = new Set(completedExerciseIds)
  const allComplete = requiredExerciseIds.length > 0 && requiredExerciseIds.every(id => completedSet.has(id))

  if (!allComplete) return { allComplete: false }

  // AMRAP対象（top_set_is_amrap=true）のmovement_patternをWeek9パラメータから特定
  const { data: week9Params, error: paramsError } = await supabase
    .from('movement_pattern_weekly_params')
    .select('movement_pattern, top_set_is_amrap')
    .eq('program_id', enrollment.program_id)
    .eq('week_number', 9)

  if (paramsError) return { error: '週次パラメータの取得に失敗しました' }
  const amrapPatterns = new Set(
    (week9Params ?? []).filter((p: { top_set_is_amrap: boolean }) => p.top_set_is_amrap)
      .map((p: { movement_pattern: string }) => p.movement_pattern)
  )

  // AMRAP対象スロットのみ、Week9のトップセット実績からEpley推定で新1RMを算出。
  // 対象外（アイソレーション種目等）は何もしない＝既存の1RMがそのまま「最新」として使われ続ける。
  const newOneRms: { slot_id: string; one_rm_kg: number }[] = []
  for (const a of assignments) {
    const movementPattern = a.user_exercises?.exercise_master?.movement_pattern
    if (!movementPattern || !amrapPatterns.has(movementPattern)) continue

    const topSets = topSetsByExercise.get(a.exercise_id)
    if (!topSets || topSets.length === 0) continue

    // 同じ種目を週内に複数回記録している場合は最も良い推定値を採用
    const best = topSets.reduce((max, s) => Math.max(max, estimateOneRm(s.weight_kg, s.reps)), 0)
    if (best > 0) newOneRms.push({ slot_id: a.slot_id, one_rm_kg: best })
  }

  // 成長レポート: 「このサイクル開始時点で有効だった1RM」（recorded_at < enrollment.started_at
  // の最新行）と比較する。旧1RMが無い（このプログラムで初めて記録した種目）場合は「初挑戦」。
  const { data: priorOneRmRows, error: priorOneRmError } = await supabase
    .from('user_slot_one_rms')
    .select('slot_id, one_rm_kg, recorded_at')
    .eq('user_id', user.id)
    .lt('recorded_at', enrollment.started_at)
    .order('recorded_at', { ascending: false })

  if (priorOneRmError) return { error: '過去の1RM取得に失敗しました' }
  const priorOneRmBySlot = new Map<string, number>()
  for (const row of priorOneRmRows ?? []) {
    if (!priorOneRmBySlot.has(row.slot_id)) priorOneRmBySlot.set(row.slot_id, row.one_rm_kg)
  }

  const exerciseNameBySlot = new Map(assignments.map(a => [a.slot_id, a.user_exercises?.name ?? '']))
  const oneRmGains: OneRmGain[] = newOneRms.map(({ slot_id, one_rm_kg }) => ({
    slot_id,
    exercise_name: exerciseNameBySlot.get(slot_id) ?? '',
    old_one_rm_kg: priorOneRmBySlot.get(slot_id) ?? null,
    new_one_rm_kg: one_rm_kg,
  }))

  // サイクル全体（開始日〜今日）の総セッション数・総ボリューム（重量×回数の総和、
  // ウォームアップ除く）を集計する。
  const { data: cycleSessions, error: cycleSessionsError } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', user.id)
    .gte('trained_at', enrollment.started_at)

  if (cycleSessionsError) return { error: 'サイクル全体のセッション取得に失敗しました' }
  const cycleSessionIds = (cycleSessions ?? []).map((s: { id: string }) => s.id)

  let totalVolumeKg = 0
  if (cycleSessionIds.length > 0) {
    const { data: cycleSets, error: cycleSetsError } = await supabase
      .from('training_sets')
      .select('weight_kg, reps')
      .in('session_id', cycleSessionIds)
      .eq('is_warmup', false)

    if (cycleSetsError) return { error: 'サイクル全体のセット取得に失敗しました' }
    totalVolumeKg = (cycleSets ?? []).reduce((sum: number, s: { weight_kg: number; reps: number }) => sum + s.weight_kg * s.reps, 0)
  }

  const growthReport: GrowthReport = {
    cycle_started_at: enrollment.started_at,
    cycle_completed_at: todayJST(),
    total_sessions: cycleSessionIds.length,
    total_volume_kg: Math.round(totalVolumeKg),
    one_rm_gains: oneRmGains,
  }

  return { allComplete: true, newOneRms, assignments, growthReport }
}

export { todayJST }
