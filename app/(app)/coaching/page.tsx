import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CoachingClient from './CoachingClient'
import type { DayData, WeightHistory } from './CoachingClient'

const SLOT_DEFS = [
  // Day 1
  { slot_id: 'chest_compound',             label: '胸',         day_number: 1 },
  { slot_id: 'back_vertical_pull',         label: '背中',       day_number: 1 },
  { slot_id: 'back_horizontal_pull',       label: '背中',       day_number: 1 },
  { slot_id: 'shoulder_lateral',           label: '肩',         day_number: 1 },
  { slot_id: 'shoulder_rear_delt',         label: '肩（後部）', day_number: 1 },
  { slot_id: 'triceps',                    label: '腕',         day_number: 1 },
  { slot_id: 'biceps',                     label: '腕',         day_number: 1 },
  // Day 2
  { slot_id: 'quad_glute_primary',         label: '脚',         day_number: 2 },
  { slot_id: 'hamstring_glute',            label: '脚（裏側）', day_number: 2 },
  { slot_id: 'quad_ham_glute',             label: '脚（補助）', day_number: 2 },
  { slot_id: 'calves_seated',              label: 'ふくらはぎ', day_number: 2 },
  { slot_id: 'core',                       label: '腹筋',       day_number: 2 },
  // Day 3
  { slot_id: 'shoulder_vertical_press',    label: '肩',         day_number: 3 },
  { slot_id: 'chest_triceps_compound',     label: '胸・腕',     day_number: 3 },
  { slot_id: 'back_horizontal_pull_heavy', label: '背中',       day_number: 3 },
  { slot_id: 'back_vertical_pull_alt',     label: '背中',       day_number: 3 },
  { slot_id: 'chest_isolation',            label: '胸（補助）', day_number: 3 },
  { slot_id: 'shoulder_lateral_cable',     label: '肩',         day_number: 3 },
  { slot_id: 'biceps_alt',                 label: '腕',         day_number: 3 },
  // Day 4
  { slot_id: 'hamstring_glute_heavy',      label: '脚（裏側）', day_number: 4 },
  { slot_id: 'quad_glute_secondary',       label: '脚（補助）', day_number: 4 },
  { slot_id: 'calves_standing',            label: 'ふくらはぎ', day_number: 4 },
  { slot_id: 'core_alt',                   label: '腹筋',       day_number: 4 },
] as const

const COMPOUND_SLOT_IDS = new Set([
  'chest_compound',
  'shoulder_vertical_press',
  'quad_glute_primary',
  'hamstring_glute_heavy',
])

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
    .select('id, days_per_week, session_duration_minutes, current_week, started_at')
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

  const [{ data: rawAssignments }, { data: rawOneRms }, { data: rawExtras }] = await Promise.all([
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
  ])

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

  const daysPerWeek = enrollment.days_per_week ?? 0
  const dayNumbers = [1, 2, 3, 4].filter(d => d <= daysPerWeek)

  const dayData: DayData[] = dayNumbers
    .map(day => ({
      day,
      slots: SLOT_DEFS
        .filter(s => s.day_number === day && assignmentMap.has(s.slot_id))
        .map(s => ({
          slotId: s.slot_id,
          label: s.label,
          exerciseName: assignmentMap.get(s.slot_id) ?? '',
          oneRm: oneRmMap.get(s.slot_id),
        })),
      extras: extrasByDay.get(day) ?? [],
    }))
    .filter(d => d.slots.length > 0)

  // 重量推移データ（コンパウンドスロットのみ）
  let weightHistory: WeightHistory[] = []

  const compoundSlots = Array.from(exerciseIdBySlot.entries())
    .filter(([slotId]) => COMPOUND_SLOT_IDS.has(slotId))
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
        currentWeek: enrollment.current_week,
        daysPerWeek: enrollment.days_per_week,
        sessionDurationMinutes: enrollment.session_duration_minutes,
        startedAt: enrollment.started_at,
      }}
      dayData={dayData}
      weightHistory={weightHistory}
    />
  )
}
