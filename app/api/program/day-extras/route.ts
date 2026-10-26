import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type LastRecord = { weight_kg: number; reps: number; duration_seconds: number | null; distance_km: number | null; calories_kcal: number | null }

export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const day = parseInt(searchParams.get('day') ?? '1', 10)
  if (day < 1 || day > 4) return NextResponse.json({ error: 'day は 1〜4 で指定してください' }, { status: 400 })

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ extras: [] })

  // Day画面からの追加は「その週だけ」（2026-10-19）。今週分だけ返し、翌週になると表示されなくなる。
  // 毎週続ける種目はプログラム画面からカスタムスロット（user_custom_slots）として追加する。
  const { data, error } = await supabase
    .from('user_program_day_extras')
    .select('id, exercise_id, user_exercises(custom_name, custom_target_muscle, exercise_master(name, target_muscle))')
    .eq('enrollment_id', enrollment.id)
    .eq('day_number', day)
    .eq('week_number', enrollment.current_week)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string
    exercise_id: string
    user_exercises: { custom_name: string | null; custom_target_muscle: string | null; exercise_master: { name: string; target_muscle: string } | null } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const exerciseIds = rows.map(r => r.exercise_id)

  // 直前の記録重量を取得
  const lastWeightMap = new Map<string, LastRecord>()
  if (exerciseIds.length > 0) {
    const { data: recentSessions } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .order('trained_at', { ascending: false })
      .limit(60)

    const sessionIds = (recentSessions ?? []).map(s => s.id)
    if (sessionIds.length > 0) {
      const { data: sets } = await supabase
        .from('training_sets')
        .select('exercise_id, weight_kg, reps, session_id, duration_seconds, distance_km, calories_kcal')
        .in('exercise_id', exerciseIds)
        .in('session_id', sessionIds)
        .eq('is_warmup', false)

      // sessionIds は trained_at 降順なので、インデックスが小さいほど新しい
      const sessionOrder = new Map(sessionIds.map((id, i) => [id, i]))
      type WeightEntry = LastRecord & { sessionIdx: number }
      const bestByExercise = new Map<string, WeightEntry>()
      for (const set of sets ?? []) {
        const exId = set.exercise_id as string
        const idx = sessionOrder.get(set.session_id as string) ?? Infinity
        const existing = bestByExercise.get(exId)
        if (!existing || idx < existing.sessionIdx) {
          bestByExercise.set(exId, {
            weight_kg: set.weight_kg as number,
            reps: set.reps as number,
            duration_seconds: set.duration_seconds as number | null,
            distance_km: set.distance_km as number | null,
            calories_kcal: set.calories_kcal as number | null,
            sessionIdx: idx,
          })
        }
      }
      for (const [exId, entry] of bestByExercise) {
        lastWeightMap.set(exId, entry)
      }
    }
  }

  const extras = rows.map(r => {
    const ue = r.user_exercises
    const name = (ue && !Array.isArray(ue))
      ? (ue.exercise_master?.name ?? ue.custom_name ?? '')
      : ''
    const target_muscle = (ue && !Array.isArray(ue)) ? (ue.exercise_master?.target_muscle ?? ue.custom_target_muscle ?? null) : null
    const last = lastWeightMap.get(r.exercise_id)
    // 有酸素の前回は時間・距離・消費カロリーで返す。重量・回数は返さない（公開中の古いアプリに「0kg × 0回」と出さないため）
    const lastCardio = last?.duration_seconds != null
      ? { duration_seconds: last.duration_seconds, distance_km: last.distance_km, calories_kcal: last.calories_kcal }
      : null
    return {
      dbId: r.id,
      id: r.exercise_id,
      name,
      target_muscle,
      last_weight_kg: lastCardio ? null : last?.weight_kg ?? null,
      last_reps: lastCardio ? null : last?.reps ?? null,
      last_cardio: lastCardio,
    }
  })

  return NextResponse.json({ extras })
}

export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exercise_id, day_number } = await request.json()
  if (!exercise_id || !day_number) {
    return NextResponse.json({ error: 'exercise_id と day_number が必要です' }, { status: 400 })
  }

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  // exercise_idが自分自身のuser_exercisesであることを確認する（FK制約は存在確認のみで
  // 所有権までは保証しないため、2026-07-09コードレビュー対応）
  const { data: ownedExercise } = await supabase
    .from('user_exercises')
    .select('id')
    .eq('id', exercise_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!ownedExercise) return NextResponse.json({ error: 'この種目は使用できません' }, { status: 403 })

  const { error } = await supabase
    .from('user_program_day_extras')
    .insert({ user_id: user.id, enrollment_id: enrollment.id, exercise_id, day_number, week_number: enrollment.current_week })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
