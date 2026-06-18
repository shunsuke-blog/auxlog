import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CreateSessionSchema } from '@/lib/validation/schemas'
import { validationError, dbError } from '@/lib/api/errors'
import { API } from '@/lib/constants/api'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateSessionSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { trained_at, fatigue_level, memo, sets } = parsed.data

  const { data: session, error: sessionError } = await supabase
    .from('training_sessions')
    .insert({ user_id: user.id, trained_at, fatigue_level, memo: memo || null })
    .select()
    .single()

  if (sessionError) return dbError('セッションの保存に失敗しました', sessionError)

  const setsToInsert = sets.map(s => ({
    session_id: session.id,
    exercise_id: s.exercise_id,
    set_number: s.set_number,
    weight_kg: s.weight_kg,
    reps: s.reps,
    rir: s.rir,
    is_warmup: s.is_warmup ?? false,
  }))

  const { error: setsError } = await supabase
    .from('training_sets')
    .insert(setsToInsert)

  if (setsError) {
    await supabase.from('training_sessions').delete().eq('id', session.id)
    return NextResponse.json({ error: 'セットの保存に失敗しました' }, { status: 500 })
  }

  // exercise_bests テーブルで自己最高記録と比較・更新
  const workingSets = sets.filter(s => !s.is_warmup)
  const exerciseIds = [...new Set(workingSets.map(s => s.exercise_id))]
  let is_improved = false
  let is_volume_up = false

  if (exerciseIds.length > 0) {
    // 今回セッションの種目ごとベストを集計
    type CurrBest = { weight: number; reps: number; volume: number; totalReps: number }
    const currBests: Record<string, CurrBest> = {}
    for (const s of workingSets) {
      const c = currBests[s.exercise_id]
      if (!c) {
        currBests[s.exercise_id] = { weight: s.weight_kg, reps: s.reps, volume: s.weight_kg * s.reps, totalReps: s.reps }
      } else {
        if (s.weight_kg > c.weight || (s.weight_kg === c.weight && s.reps > c.reps)) {
          c.weight = s.weight_kg
          c.reps   = s.reps
        }
        c.volume    += s.weight_kg * s.reps
        c.totalReps += s.reps
      }
    }

    // exercise_bests から自己最高記録を取得（1クエリ、最大 exerciseIds.length 行）
    const { data: storedBests } = await supabase
      .from('exercise_bests')
      .select('exercise_id, best_weight_kg, best_reps, best_volume, best_total_reps')
      .eq('user_id', user.id)
      .in('exercise_id', exerciseIds)

    const bestMap = new Map((storedBests ?? []).map(b => [b.exercise_id, b]))

    // 記録更新判定
    is_improved = exerciseIds.some(id => {
      const curr = currBests[id]
      const prev = bestMap.get(id)
      if (!prev) return true
      return curr.weight > prev.best_weight_kg ||
        (curr.weight === prev.best_weight_kg && curr.reps > prev.best_reps)
    })
    if (!is_improved) {
      is_volume_up = exerciseIds.some(id => {
        const curr = currBests[id]
        const prev = bestMap.get(id)
        return !prev || curr.volume > prev.best_volume
      })
    }

    // exercise_bests を upsert（既存レコードと今回セッション値をマージ）
    const upserts = exerciseIds.map(id => {
      const curr = currBests[id]
      const prev = bestMap.get(id)
      let newWeight = curr.weight
      let newReps   = curr.reps
      if (prev) {
        if (curr.weight < prev.best_weight_kg) {
          newWeight = prev.best_weight_kg
          newReps   = prev.best_reps
        } else if (curr.weight === prev.best_weight_kg) {
          newReps = Math.max(curr.reps, prev.best_reps)
        }
      }
      return {
        user_id:         user.id,
        exercise_id:     id,
        best_weight_kg:  newWeight,
        best_reps:       newReps,
        best_volume:     prev ? Math.max(curr.volume, prev.best_volume) : curr.volume,
        best_total_reps: prev ? Math.max(curr.totalReps, prev.best_total_reps) : curr.totalReps,
        updated_at:      new Date().toISOString(),
      }
    })
    await supabase.from('exercise_bests').upsert(upserts)

    // user_exercises.recent_session_ids を更新（直近3セッション ID を保持）
    await supabase.rpc('update_recent_session_ids', {
      p_exercise_ids: exerciseIds,
      p_session_id: session.id,
    })
  }

  return NextResponse.json({ session_id: session.id, created_at: session.created_at, is_improved, is_volume_up })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rawLimit = parseInt(searchParams.get('limit') ?? String(API.PAGINATION_DEFAULT), 10)
  const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? API.PAGINATION_DEFAULT : rawLimit), API.PAGINATION_MAX)
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset)

  const { data: sessions, error, count } = await supabase
    .from('training_sessions')
    .select('*, training_sets(id, session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, created_at)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('trained_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return dbError('セッションの取得に失敗しました', error)

  const sessionsWithVolume = (sessions ?? []).map(s => {
    const sets = s.training_sets ?? []
    const totalVolume = (sets as Array<{ weight_kg: number; reps: number; is_warmup: boolean }>).reduce((acc, set) => acc + (set.is_warmup ? 0 : set.weight_kg * set.reps), 0)
    return { ...s, sets, total_volume: Math.round(totalVolume) }
  })

  return NextResponse.json({ sessions: sessionsWithVolume, total: count ?? 0 })
}
