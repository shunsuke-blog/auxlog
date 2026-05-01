import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TargetMuscle } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_exercises')
    .select(`
      *,
      exercise_master(name, target_muscle)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exercises = (data ?? []).map((e: {
    id: string
    user_id: string
    exercise_master_id: string | null
    custom_name: string | null
    custom_target_muscle: string | null
    default_sets: number
    default_reps: number
    sort_order: number
    is_active: boolean
    created_at: string
    exercise_master: { name: string; target_muscle: string } | null
  }) => ({
    ...e,
    name: e.custom_name ?? e.exercise_master?.name ?? '',
    target_muscle: (e.custom_target_muscle ?? e.exercise_master?.target_muscle ?? '') as TargetMuscle,
  }))

  return NextResponse.json({ exercises })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { exercise_master_id, custom_name, custom_target_muscle, default_sets, default_reps } = body

  // 既存の最大sort_orderを取得
  const { data: existing } = await supabase
    .from('user_exercises')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('user_exercises')
    .insert({
      user_id: user.id,
      exercise_master_id: exercise_master_id ?? null,
      custom_name: custom_name ?? null,
      custom_target_muscle: custom_target_muscle ?? null,
      default_sets: default_sets ?? 3,
      default_reps: default_reps ?? 8,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exercise: data })
}
