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

  return NextResponse.json({ session_id: session.id, created_at: session.created_at })
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
