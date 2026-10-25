import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import CoachingRecordClient, { type PrefillSet } from './CoachingRecordClient'

type Row = {
  id: string
  note: string | null
  exercise_master_id: string | null
  trainer_exercise_id: string | null
  exercise_master: { name: string; is_bodyweight: boolean | null } | null
  trainer_exercises: { name: string; is_bodyweight: boolean | null } | null
  plan_sets: { set_number: number; target_weight_kg: number | null; target_pct_1rm: number | null; target_reps: number; target_rir: number | null; is_warmup: boolean }[]
  plan_days: { week_number: number; day_number: number } | null
}

// コーチングモードの記録画面（プランの1種目）。目標セットを初期値にし、重量が空欄（自動）の
// セットは前回の同じ種目の記録から入れる。
export default async function CoachingRecordPage({ params }: { params: Promise<{ planExerciseId: string }> }) {
  const { planExerciseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('plan_exercises')
    .select('id, note, exercise_master_id, trainer_exercise_id, exercise_master(name, is_bodyweight), trainer_exercises(name, is_bodyweight), plan_sets(set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup), plan_days(week_number, day_number)')
    .eq('id', planExerciseId)
    .maybeSingle()
  if (!data) notFound()
  const pe = data as unknown as Row
  const ref = pe.exercise_master ?? pe.trainer_exercises
  const isBodyweight = ref?.is_bodyweight ?? false

  const [{ data: recorded }, { data: userExercise }] = await Promise.all([
    supabase.from('training_sets').select('id').eq('plan_exercise_id', planExerciseId).limit(1),
    pe.exercise_master_id
      ? supabase.from('user_exercises').select('id').eq('user_id', user.id).eq('exercise_master_id', pe.exercise_master_id).order('is_active', { ascending: false }).limit(1).maybeSingle()
      : supabase.from('user_exercises').select('id').eq('user_id', user.id).eq('trainer_exercise_id', pe.trainer_exercise_id!).maybeSingle(),
  ])

  // 前回の記録（重量が空欄＝自動のセットの初期値）。同じセット番号、無ければ最後のワーキングセット
  let lastSets: { set_number: number; weight_kg: number; is_warmup: boolean }[] = []
  if (userExercise) {
    const { data: last } = await supabase
      .from('training_sessions')
      .select('id, training_sets!inner(set_number, weight_kg, is_warmup, exercise_id)')
      .eq('user_id', user.id)
      .eq('training_sets.exercise_id', userExercise.id)
      .order('trained_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    type LastSet = { set_number: number; weight_kg: number; is_warmup: boolean }
    lastSets = ((last?.training_sets ?? []) as LastSet[]).map(r => ({ set_number: r.set_number, weight_kg: Number(r.weight_kg), is_warmup: r.is_warmup }))
  }
  const lastWorking = lastSets.filter(s => !s.is_warmup).sort((a, b) => b.weight_kg - a.weight_kg)[0]

  const prefill: PrefillSet[] = [...pe.plan_sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map(s => {
      const fromLast = lastSets.find(l => l.set_number === s.set_number && l.is_warmup === s.is_warmup) ?? (s.is_warmup ? undefined : lastWorking)
      const weight = s.target_weight_kg != null ? Number(s.target_weight_kg) : isBodyweight ? 0 : fromLast?.weight_kg ?? null
      return {
        setNumber: s.set_number,
        weightKg: weight,
        weightIsTarget: s.target_weight_kg != null,
        // %1RM のセットなのに重量が無い（トレーナーが1RMを入れていない）。初回の記録から重量を自動計算する
        awaitingOneRm: s.target_pct_1rm != null && s.target_weight_kg == null,
        reps: s.target_reps,
        rir: s.target_rir,
        isWarmup: s.is_warmup,
      }
    })

  return (
    <CoachingRecordClient
      planExerciseId={pe.id}
      name={ref?.name ?? '種目'}
      note={pe.note}
      day={pe.plan_days?.day_number ?? 1}
      isBodyweight={isBodyweight}
      prefill={prefill}
      alreadyRecorded={(recorded ?? []).length > 0}
    />
  )
}
