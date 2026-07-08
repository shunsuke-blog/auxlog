import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CoachingClient from './CoachingClient'
import type { DayData, WeightHistory } from './CoachingClient'
import { BASE_CATEGORIES_BY_RANK, LEG_DEFAULT_CATEGORY, type CompositionCategory } from '@/lib/constants/program_composition'
import { buildExerciseCategories, distributeToDays, isOneRmDemotedAtDays, type DaysPerWeek } from '@/lib/suggest/generate_program_composition'
import type { PriorityMuscleOption } from '@/types'

const ALL_CATEGORIES: CompositionCategory[] = [...BASE_CATEGORIES_BY_RANK.values(), LEG_DEFAULT_CATEGORY]

const MUSCLE_LABELS: Record<string, string> = {
  chest: '胸', back: '背中', shoulders: '肩', legs: '脚', arms: '腕', core: '腹筋',
}

type AssignmentRow = {
  slot_id: string
  exercise_id: string
  user_exercises: { custom_name: string | null; exercise_master: { name: string } | null } | null
}

type ExtraRow = {
  id: string
  exercise_id: string
  day_number: number
  user_exercises: { custom_name: string | null; exercise_master: { name: string; target_muscle: string | null } | null } | null
}

export default async function CoachingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, days_per_week, session_duration_minutes, current_week, started_at, priority_muscles')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
          <h1 className="text-xl font-semibold text-black dark:text-white">コーチング</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-2">
          <p className="text-base font-semibold text-black dark:text-white">プログラムが未設定です</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">設定からプログラムを開始してください</p>
        </div>
      </div>
    )
  }

  const days = (enrollment.days_per_week ?? 4) as DaysPerWeek
  const priorities = (enrollment.priority_muscles ?? []) as PriorityMuscleOption[]

  const [{ data: rawAssignments }, { data: rawOneRms }, { data: rawExtras }, { data: rawSlotExercises }] = await Promise.all([
    supabase
      .from('user_slot_assignments')
      .select('slot_id, exercise_id, user_exercises(custom_name, exercise_master(name))')
      .eq('enrollment_id', enrollment.id)
      .eq('is_hidden', false),
    supabase
      .from('user_slot_one_rms')
      .select('slot_id, one_rm_kg')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('user_program_day_extras')
      .select('id, exercise_id, day_number, user_exercises(custom_name, exercise_master(name, target_muscle))')
      .eq('enrollment_id', enrollment.id)
      .order('created_at'),
    supabase
      .from('exercise_master')
      .select('name, target_muscle, movement_pattern, requires_one_rm')
      .not('movement_pattern', 'is', null)
      .order('sort_order'),
  ])

  const requiresOneRmByName = new Map(
    (rawSlotExercises ?? []).map(ex => [ex.name as string, ex.requires_one_rm as boolean])
  )

  // カテゴリごとのスワップ候補。movementPatternを持つカテゴリはそれで一致するものだけ
  // （腕の二頭/三頭、肩のプレス/側方/後部を混同しないため。2026-07-08、
  // OnboardingClient.tsxのmatchingExercisesと同じロジックに統一）
  const slotOptions = new Map<string, string[]>()
  for (const category of ALL_CATEGORIES) {
    const options = (rawSlotExercises ?? [])
      .filter(ex => category.movementPattern
        ? ex.movement_pattern === category.movementPattern
        : ex.target_muscle === category.muscle)
      .map(ex => ex.name as string)
    slotOptions.set(category.id, options)
  }

  const assignmentMap = new Map<string, string>()
  const exerciseIdBySlot = new Map<string, string>()

  for (const a of (rawAssignments ?? []) as unknown as AssignmentRow[]) {
    const ue = a.user_exercises
    const name = (ue && !Array.isArray(ue))
      ? (ue.exercise_master?.name ?? ue.custom_name ?? '')
      : ''
    assignmentMap.set(a.slot_id, name)
    exerciseIdBySlot.set(a.slot_id, a.exercise_id)
  }

  const oneRmMap = new Map<string, number>()
  for (const r of rawOneRms ?? []) {
    if (!oneRmMap.has(r.slot_id as string)) {
      oneRmMap.set(r.slot_id as string, r.one_rm_kg as number)
    }
  }

  const extrasByDay = new Map<number, { id: string; name: string; muscleLabel: string | null }[]>()
  for (const r of (rawExtras ?? []) as unknown as ExtraRow[]) {
    const ue = r.user_exercises
    const name = (ue && !Array.isArray(ue))
      ? (ue.exercise_master?.name ?? ue.custom_name ?? '')
      : ''
    const targetMuscle = (ue && !Array.isArray(ue))
      ? (ue.exercise_master?.target_muscle ?? null)
      : null
    const muscleLabel = targetMuscle ? (MUSCLE_LABELS[targetMuscle] ?? targetMuscle) : null
    if (!extrasByDay.has(r.day_number)) extrasByDay.set(r.day_number, [])
    extrasByDay.get(r.day_number)!.push({ id: r.id, name, muscleLabel })
  }

  const dayNumbers = [1, 2, 3, 4].filter(d => d <= days)

  const categories = buildExerciseCategories(days, priorities)
  const dayCategories = distributeToDays(days, categories)

  const dayData: DayData[] = dayNumbers
    .map(day => ({
      day,
      slots: (dayCategories.get(day) ?? [])
        .filter(c => assignmentMap.has(c.id))
        .map(c => ({
          slotId: c.id,
          label: c.label,
          exerciseName: assignmentMap.get(c.id) ?? '',
          oneRm: oneRmMap.get(c.id),
          options: slotOptions.get(c.id) ?? [],
        })),
      extras: extrasByDay.get(day) ?? [],
    }))
    .filter(d => d.slots.length > 0)

  // 重量推移データ（1RM管理スロットのみ。頻度によって対象が変わる）
  let weightHistory: WeightHistory[] = []

  // 1RM管理は種目ごとの属性が正（program_engine.tsのhasOneRm判定と同じロジック、
  // 2026-07-08実機確認フィードバック対応）
  const compoundSlotIds = new Set(
    ALL_CATEGORIES
      .filter(c => !isOneRmDemotedAtDays(c, days) && (requiresOneRmByName.get(assignmentMap.get(c.id) ?? '') ?? false))
      .map(c => c.id)
  )
  const compoundSlots = Array.from(exerciseIdBySlot.entries())
    .filter(([slotId]) => compoundSlotIds.has(slotId))
    .map(([slotId, exerciseId]) => ({
      slotId,
      exerciseId,
      name: assignmentMap.get(slotId) ?? '',
    }))

  if (compoundSlots.length > 0 && enrollment.started_at) {
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('id, trained_at')
      .eq('user_id', user.id)
      .gte('trained_at', enrollment.started_at)
      .order('trained_at')

    const sessionIds = (sessions ?? []).map(s => s.id as string)

    if (sessionIds.length > 0) {
      const { data: sets } = await supabase
        .from('training_sets')
        .select('exercise_id, weight_kg, session_id')
        .in('session_id', sessionIds)
        .in('exercise_id', compoundSlots.map(s => s.exerciseId))
        .eq('is_warmup', false)

      const sessionDateMap = new Map(
        (sessions ?? []).map(s => [s.id as string, new Date(s.trained_at as string)])
      )
      const startedAt = new Date(enrollment.started_at)
      const getWeek = (date: Date) =>
        Math.floor((date.getTime() - startedAt.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1

      const weekWeightMap = new Map<string, Map<number, number>>()
      for (const set of sets ?? []) {
        const date = sessionDateMap.get(set.session_id as string)
        if (!date) continue
        const week = getWeek(date)
        if (week < 1 || week > 9) continue
        const exId = set.exercise_id as string
        if (!weekWeightMap.has(exId)) weekWeightMap.set(exId, new Map())
        const exMap = weekWeightMap.get(exId)!
        exMap.set(week, Math.max(exMap.get(week) ?? 0, set.weight_kg as number))
      }

      weightHistory = compoundSlots
        .map(({ slotId, exerciseId, name }) => ({
          slotId,
          exerciseName: name,
          data: Array.from(weekWeightMap.get(exerciseId)?.entries() ?? [])
            .map(([week, maxWeight]) => ({ week, maxWeight }))
            .sort((a, b) => a.week - b.week),
        }))
        .filter(e => e.data.length > 0)
    }
  }

  return (
    <CoachingClient
      enrollment={{
        id: enrollment.id,
        currentWeek: enrollment.current_week,
        daysPerWeek: enrollment.days_per_week,
        sessionDurationMinutes: enrollment.session_duration_minutes,
        startedAt: enrollment.started_at,
        priorityMuscles: priorities,
      }}
      dayData={dayData}
      weightHistory={weightHistory}
    />
  )
}
