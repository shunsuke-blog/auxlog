import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalizeExercises } from '@/lib/normalize/exercises'
import { CreateExerciseSchema } from '@/lib/validation/schemas'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_exercises')
    .select('*, exercise_master(name, target_muscle, is_bodyweight)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: '種目の取得に失敗しました' }, { status: 500 })

  return NextResponse.json({ exercises: normalizeExercises(data ?? []) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateExerciseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' }, { status: 400 })
  }
  const { exercise_master_id, custom_name, custom_target_muscle, default_sets, default_reps, is_compound } = parsed.data

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
      is_compound: exercise_master_id ? undefined : (is_compound ?? false),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '種目の追加に失敗しました' }, { status: 500 })

  return NextResponse.json({ exercise: data })
}
