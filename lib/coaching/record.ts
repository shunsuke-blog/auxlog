import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInJapan } from './week_dates'
import type { CardioRecord } from '@/lib/record/cardio'

// コーチングモードの記録画面（プランの1種目）のデータ。目標セットを初期値にし、重量が空欄（自動）の
// セットは前回の同じ種目の記録から入れる。Web の記録画面とアプリ用の API（GET /api/coaching-plan/exercises/[id]）で共通。

export type PrefillSet = {
  setNumber: number
  /** null = トレーナーの指定なし・前回記録もなし（自分で入力） */
  weightKg: number | null
  weightIsTarget: boolean
  /** %1RM のセットだが重量がまだ無い（初回の記録から自動計算する） */
  awaitingOneRm?: boolean
  reps: number
  rir: number | null
  isWarmup: boolean
}

export type CoachingRecordData = {
  planExerciseId: string
  name: string
  note: string | null
  day: number
  isBodyweight: boolean
  prefill: PrefillSet[]
  alreadyRecorded: boolean
  /** 前回までの自己ベスト（記録中の「Record! / Volume Up!」と「前回 ▶ 今回」の総挙上量に使う）。初めての種目は null */
  prevBest: { weight: number; reps: number; volume: number; totalReps: number } | null
  /** 今の週の予定の開始日より前（週を早く進めた）。オーバーワークの注意を出す（セルフモードと同じ、2026-10-25） */
  beforeWeekStart: boolean
  /** 有酸素運動の種目なら、目標と前回の記録（2026-10-26）。その時 prefill は空で、時間・距離・消費カロリーを記録する */
  cardio: {
    targetDurationSeconds: number | null
    targetDistanceKm: number | null
    /** 距離の欄を出すか（縄跳び・ステアクライマーは出さない） */
    tracksDistance: boolean
    previous: (CardioRecord & { trainedAt: string }) | null
  } | null
}

type Row = {
  id: string
  note: string | null
  exercise_master_id: string | null
  trainer_exercise_id: string | null
  cardio_master_id: string | null
  target_duration_seconds: number | null
  target_distance_km: number | string | null
  exercise_master: { name: string; is_bodyweight: boolean | null } | null
  trainer_exercises: { name: string; is_bodyweight: boolean | null; target_muscle: string | null } | null
  cardio_master: { name: string; tracks_distance: boolean } | null
  plan_sets: { set_number: number; target_weight_kg: number | null; target_pct_1rm: number | null; target_reps: number; target_rir: number | null; is_warmup: boolean }[]
  plan_days: { week_number: number; day_number: number; coaching_plans: { start_date: string | null; current_week: number } | null } | null
}

export async function loadCoachingRecord(supabase: SupabaseClient, userId: string, planExerciseId: string): Promise<CoachingRecordData | null> {
  const { data } = await supabase
    .from('plan_exercises')
    .select('id, note, exercise_master_id, trainer_exercise_id, cardio_master_id, target_duration_seconds, target_distance_km, exercise_master(name, is_bodyweight), trainer_exercises(name, is_bodyweight, target_muscle), cardio_master(name, tracks_distance), plan_sets(set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup), plan_days(week_number, day_number, coaching_plans(start_date, current_week))')
    .eq('id', planExerciseId)
    .maybeSingle()
  if (!data) return null
  const pe = data as unknown as Row
  const ref = pe.exercise_master ?? pe.trainer_exercises
  const isBodyweight = ref?.is_bodyweight ?? false
  const isCardio = pe.cardio_master_id != null || pe.trainer_exercises?.target_muscle === 'cardio'

  const [{ data: recorded }, { data: userExercise }] = await Promise.all([
    supabase.from('training_sets').select('id').eq('plan_exercise_id', planExerciseId).limit(1),
    pe.exercise_master_id
      ? supabase.from('user_exercises').select('id').eq('user_id', userId).eq('exercise_master_id', pe.exercise_master_id).order('is_active', { ascending: false }).limit(1).maybeSingle()
      : pe.cardio_master_id
      ? supabase.from('user_exercises').select('id').eq('user_id', userId).eq('cardio_master_id', pe.cardio_master_id).order('is_active', { ascending: false }).limit(1).maybeSingle()
      : supabase.from('user_exercises').select('id').eq('user_id', userId).eq('trainer_exercise_id', pe.trainer_exercise_id!).maybeSingle(),
  ])

  // 前回の記録（重量が空欄＝自動のセットの初期値）。同じセット番号、無ければ最後のワーキングセット
  let lastSets: { set_number: number; weight_kg: number; is_warmup: boolean }[] = []
  let previousCardio: (CardioRecord & { trainedAt: string }) | null = null
  if (userExercise) {
    const { data: last } = await supabase
      .from('training_sessions')
      .select('id, trained_at, training_sets!inner(set_number, weight_kg, is_warmup, exercise_id, duration_seconds, distance_km, calories_kcal)')
      .eq('user_id', userId)
      .eq('training_sets.exercise_id', userExercise.id)
      .order('trained_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    type LastSet = { set_number: number; weight_kg: number; is_warmup: boolean }
    lastSets = ((last?.training_sets ?? []) as LastSet[]).map(r => ({ set_number: r.set_number, weight_kg: Number(r.weight_kg), is_warmup: r.is_warmup }))
    const lastCardio = ((last?.training_sets ?? []) as (LastSet & CardioRecord)[]).find(r => r.duration_seconds != null)
    if (lastCardio && last) previousCardio = { trainedAt: last.trained_at as string, duration_seconds: lastCardio.duration_seconds, distance_km: lastCardio.distance_km, calories_kcal: lastCardio.calories_kcal }
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

  const { data: best } = userExercise
    ? await supabase.from('exercise_bests').select('best_weight_kg, best_reps, best_volume, best_total_reps').eq('user_id', userId).eq('exercise_id', userExercise.id).maybeSingle()
    : { data: null }

  // 今の週の予定の開始日（プランの開始日＋(週−1)×7日）がまだ来ていない＝前の週を早く終えて週を進めた。
  // Week 1 は「前の週」が無いので出さない（開始日より前に記録しても、早く進めたわけではない。2026-10-25 不具合修正）
  const plan = pe.plan_days?.coaching_plans
  let beforeWeekStart = false
  if (plan?.start_date && plan.current_week > 1 && pe.plan_days?.week_number === plan.current_week) {
    const weekStart = new Date(`${plan.start_date}T00:00:00Z`)
    weekStart.setUTCDate(weekStart.getUTCDate() + (plan.current_week - 1) * 7)
    beforeWeekStart = todayInJapan() < weekStart.toISOString().slice(0, 10)
  }

  return {
    planExerciseId: pe.id,
    name: ref?.name ?? pe.cardio_master?.name ?? '種目',
    note: pe.note,
    day: pe.plan_days?.day_number ?? 1,
    isBodyweight,
    prefill,
    alreadyRecorded: (recorded ?? []).length > 0,
    prevBest: best
      ? { weight: Number(best.best_weight_kg), reps: best.best_reps, volume: Number(best.best_volume), totalReps: best.best_total_reps }
      : null,
    beforeWeekStart,
    cardio: isCardio
      ? {
          targetDurationSeconds: pe.target_duration_seconds,
          targetDistanceKm: pe.target_distance_km != null ? Number(pe.target_distance_km) : null,
          tracksDistance: pe.cardio_master?.tracks_distance ?? true,
          previous: previousCardio,
        }
      : null,
  }
}
