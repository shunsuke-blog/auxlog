import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { trained_at, fatigue_level, memo, sets } = body

  const { data: session, error: sessionError } = await supabase
    .from('training_sessions')
    .insert({
      user_id: user.id,
      trained_at,
      fatigue_level,
      memo: memo || null,
    })
    .select()
    .single()

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  const setsToInsert = sets.map((s: {
    exercise_id: string
    set_number: number
    weight_kg: number
    reps: number
    rir: boolean
  }) => ({
    session_id: session.id,
    exercise_id: s.exercise_id,
    set_number: s.set_number,
    weight_kg: s.weight_kg,
    reps: s.reps,
    rir: s.rir,
  }))

  const { error: setsError } = await supabase
    .from('training_sets')
    .insert(setsToInsert)

  if (setsError) return NextResponse.json({ error: setsError.message }, { status: 500 })

  return NextResponse.json({ session_id: session.id, created_at: session.created_at })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const { data: sessions, error, count } = await supabase
    .from('training_sessions')
    .select('*, training_sets(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('trained_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessionsWithVolume = (sessions ?? []).map((s: {
    id: string
    user_id: string
    trained_at: string
    fatigue_level: number
    memo: string | null
    created_at: string
    training_sets: {
      id: string
      session_id: string
      exercise_id: string
      set_number: number
      weight_kg: number
      reps: number
      rir: boolean
      created_at: string
    }[]
  }) => {
    const sets = s.training_sets ?? []
    const totalVolume = sets.reduce(
      (acc, set) => acc + set.weight_kg * set.reps,
      0
    )
    return {
      ...s,
      sets,
      total_volume: Math.round(totalVolume),
    }
  })

  return NextResponse.json({ sessions: sessionsWithVolume, total: count ?? 0 })
}
