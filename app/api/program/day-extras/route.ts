import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const day = parseInt(searchParams.get('day') ?? '1', 10)
  if (day < 1 || day > 4) return NextResponse.json({ error: 'day は 1〜4 で指定してください' }, { status: 400 })

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ extras: [] })

  const { data, error } = await supabase
    .from('user_program_day_extras')
    .select('id, exercise_id, user_exercises(custom_name, exercise_master(name, target_muscle))')
    .eq('enrollment_id', enrollment.id)
    .eq('day_number', day)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string
    exercise_id: string
    user_exercises: { custom_name: string | null; exercise_master: { name: string; target_muscle: string } | null } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const exerciseIds = rows.map(r => r.exercise_id)

  // 直前の記録重量を取得
  const lastWeightMap = new Map<string, { weight_kg: number; reps: number }>()
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
        .select('exercise_id, weight_kg, reps, session_id')
        .in('exercise_id', exerciseIds)
        .in('session_id', sessionIds)
        .eq('is_warmup', false)

      // sessionIds は trained_at 降順なので、インデックスが小さいほど新しい
      const sessionOrder = new Map(sessionIds.map((id, i) => [id, i]))
      type WeightEntry = { weight_kg: number; reps: number; sessionIdx: number }
      const bestByExercise = new Map<string, WeightEntry>()
      for (const set of sets ?? []) {
        const exId = set.exercise_id as string
        const idx = sessionOrder.get(set.session_id as string) ?? Infinity
        const existing = bestByExercise.get(exId)
        if (!existing || idx < existing.sessionIdx) {
          bestByExercise.set(exId, { weight_kg: set.weight_kg as number, reps: set.reps as number, sessionIdx: idx })
        }
      }
      for (const [exId, entry] of bestByExercise) {
        lastWeightMap.set(exId, { weight_kg: entry.weight_kg, reps: entry.reps })
      }
    }
  }

  const extras = rows.map(r => {
    const ue = r.user_exercises
    const name = (ue && !Array.isArray(ue))
      ? (ue.exercise_master?.name ?? ue.custom_name ?? '')
      : ''
    const target_muscle = (ue && !Array.isArray(ue)) ? ue.exercise_master?.target_muscle ?? null : null
    const last = lastWeightMap.get(r.exercise_id)
    return { dbId: r.id, id: r.exercise_id, name, target_muscle, last_weight_kg: last?.weight_kg ?? null, last_reps: last?.reps ?? null }
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
    .select('id')
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
    .insert({ user_id: user.id, enrollment_id: enrollment.id, exercise_id, day_number })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
