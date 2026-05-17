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

  // 前回セッションと比較して記録更新かどうかを判定
  const workingSets = sets.filter(s => !s.is_warmup)
  const exerciseIds = [...new Set(workingSets.map(s => s.exercise_id))]
  let is_improved = false
  let is_volume_up = false

  if (exerciseIds.length > 0) {
    const { data: recentSessionsData } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .neq('id', session.id)
      .order('trained_at', { ascending: false })
      .limit(10)

    const prevSessionIds = (recentSessionsData ?? []).map(s => s.id)

    if (prevSessionIds.length > 0) {
      const { data: prevSets } = await supabase
        .from('training_sets')
        .select('exercise_id, weight_kg, reps, session_id')
        .in('session_id', prevSessionIds)
        .in('exercise_id', exerciseIds)
        .eq('is_warmup', false)

      // 種目ごとに最新セッションの最大重量・最大回数、および総重量を取得
      const prevBest: Record<string, { weight: number; reps: number }> = {}
      const prevVolume: Record<string, number> = {}
      const seenExercises = new Set<string>()

      for (const sessionId of prevSessionIds) {
        const sessionSets = (prevSets ?? []).filter(s => s.session_id === sessionId)
        const exercisesInSession = new Set(sessionSets.map(s => s.exercise_id))

        for (const exerciseId of exercisesInSession) {
          if (seenExercises.has(exerciseId)) continue
          let maxWeight = 0
          let maxReps = 0
          let totalVolume = 0
          for (const s of sessionSets.filter(s => s.exercise_id === exerciseId)) {
            if (s.weight_kg > maxWeight) { maxWeight = s.weight_kg; maxReps = s.reps }
            else if (s.weight_kg === maxWeight && s.reps > maxReps) { maxReps = s.reps }
            totalVolume += s.weight_kg * s.reps
          }
          prevBest[exerciseId] = { weight: maxWeight, reps: maxReps }
          prevVolume[exerciseId] = totalVolume
          seenExercises.add(exerciseId)
        }
        if (seenExercises.size >= exerciseIds.length) break
      }

      // 今回セッションの種目ごと最大重量・最大回数、および総重量
      const currentBest: Record<string, { weight: number; reps: number }> = {}
      const currentVolume: Record<string, number> = {}
      for (const s of workingSets) {
        if (!currentBest[s.exercise_id] || s.weight_kg > currentBest[s.exercise_id].weight) {
          currentBest[s.exercise_id] = { weight: s.weight_kg, reps: s.reps }
        } else if (s.weight_kg === currentBest[s.exercise_id].weight && s.reps > currentBest[s.exercise_id].reps) {
          currentBest[s.exercise_id].reps = s.reps
        }
        currentVolume[s.exercise_id] = (currentVolume[s.exercise_id] ?? 0) + s.weight_kg * s.reps
      }

      is_improved = exerciseIds.some(id => {
        const prev = prevBest[id]
        const curr = currentBest[id]
        if (!prev || !curr) return false
        return curr.weight > prev.weight || (curr.weight === prev.weight && curr.reps > prev.reps)
      })

      if (!is_improved) {
        is_volume_up = exerciseIds.some(id => {
          const prev = prevVolume[id]
          const curr = currentVolume[id]
          if (prev === undefined || curr === undefined) return false
          return curr > prev
        })
      }
    }
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
    const totalVolume = (sets as Array<{ weight_kg: number; reps: number }>).reduce((acc, set) => acc + set.weight_kg * set.reps, 0)
    return { ...s, sets, total_volume: Math.round(totalVolume) }
  })

  return NextResponse.json({ sessions: sessionsWithVolume, total: count ?? 0 })
}
