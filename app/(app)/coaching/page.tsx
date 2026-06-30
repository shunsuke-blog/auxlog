import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

const ONE_RM_SLOT_LABELS: Record<string, string> = {
  chest_compound:          '胸・メイン',
  shoulder_vertical_press: '肩プレス',
  quad_glute_primary:      'スクワット系',
  quad_glute_secondary:    'スクワット系（補助）',
  hamstring_glute_heavy:   'デッドリフト系',
}

export default async function CoachingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, days_per_week, current_week, started_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  type AssignmentRow = {
    slot_id: string
    user_exercises: { custom_name: string | null; exercise_master: { name: string } | null } | null
  }

  let assignmentMap = new Map<string, string>()
  let oneRmMap = new Map<string, number>()

  if (enrollment) {
    const [{ data: rawAssignments }, { data: rawOneRms }] = await Promise.all([
      supabase
        .from('user_slot_assignments')
        .select('slot_id, user_exercises(custom_name, exercise_master(name))')
        .eq('enrollment_id', enrollment.id),
      supabase
        .from('user_slot_one_rms')
        .select('slot_id, one_rm_kg')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false }),
    ])

    assignmentMap = new Map(
      (rawAssignments ?? []).map(a => {
        const row = a as unknown as AssignmentRow
        const ue = row.user_exercises
        const name =
          (ue && !Array.isArray(ue) ? ue.exercise_master?.name ?? ue.custom_name : null) ?? ''
        return [row.slot_id, name]
      })
    )

    for (const r of rawOneRms ?? []) {
      if (!oneRmMap.has(r.slot_id as string)) {
        oneRmMap.set(r.slot_id as string, r.one_rm_kg as number)
      }
    }
  }

  const daysPerWeek = enrollment?.days_per_week ?? 0
  const dayNumbers = [1, 2, 3, 4].filter(d => d <= daysPerWeek)

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">コーチング</h1>
      </div>

      <div className="px-6 py-6 space-y-4">
        {!enrollment ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-base font-semibold text-black dark:text-white">プログラムが未設定です</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">設定からプログラムを開始してください</p>
          </div>
        ) : (
          <>
            {/* プログラム概要 */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">プログラム</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">現在の週</span>
                  <span className="text-sm font-semibold text-black dark:text-white">Week {enrollment.current_week} / 9</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">頻度</span>
                  <span className="text-sm text-black dark:text-white">週{daysPerWeek}回</span>
                </div>
                {enrollment.started_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">開始日</span>
                    <span className="text-sm text-black dark:text-white">
                      {new Date(enrollment.started_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Day別スロット割り当て */}
            {dayNumbers.map(day => {
              const daySlots = SLOT_DEFS.filter(s => s.day_number === day && assignmentMap.has(s.slot_id))
              if (daySlots.length === 0) return null
              return (
                <div key={day} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Day {day}</h2>
                  <div className="space-y-2.5">
                    {daySlots.map(slot => {
                      const exerciseName = assignmentMap.get(slot.slot_id) ?? ''
                      const oneRm = oneRmMap.get(slot.slot_id)
                      return (
                        <div key={slot.slot_id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-black dark:text-white">{exerciseName}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500">{slot.label}</p>
                          </div>
                          {oneRm != null && (
                            <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                              1RM {oneRm}kg
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 1RM一覧（スロット割り当て外のもの） */}
            {oneRmMap.size > 0 && (
              <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">入力した最高重量</h2>
                <div className="space-y-2">
                  {[...oneRmMap.entries()]
                    .filter(([slot_id]) => slot_id !== 'chest_triceps_compound')
                    .map(([slot_id, kg]) => (
                      <div key={slot_id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-black dark:text-white">
                            {assignmentMap.get(slot_id) ?? slot_id}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {ONE_RM_SLOT_LABELS[slot_id] ?? slot_id}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-black dark:text-white tabular-nums">
                          {kg} kg
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
