import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalizeExercises } from '@/lib/normalize/exercises'
import { CreateExerciseSchema } from '@/lib/validation/schemas'
import { validationError, dbError } from '@/lib/api/errors'
import { CARDIO_MUSCLE } from '@/types'

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

  if (error) return dbError('種目の取得に失敗しました', error)

  return NextResponse.json({ exercises: normalizeExercises(data ?? []) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateExerciseSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { exercise_master_id, cardio_master_id, default_sets, default_reps, is_compound } = parsed.data
  let { custom_name, custom_target_muscle } = parsed.data

  // 有酸素の一覧から追加する時は、種目名を custom_name に入れて有酸素の印をつける（2026-10-26、lib/sql/cardio_2026-10-26.sql）
  if (cardio_master_id) {
    const { data: cardio } = await supabase.from('cardio_master').select('name').eq('id', cardio_master_id).maybeSingle()
    if (!cardio) return NextResponse.json({ error: '種目が見つかりません' }, { status: 404 })
    custom_name = cardio.name
    custom_target_muscle = CARDIO_MUSCLE
  }
  const isCardio = custom_target_muscle === CARDIO_MUSCLE

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
      exercise_master_id: isCardio ? null : (exercise_master_id ?? null),
      cardio_master_id: cardio_master_id ?? null,
      custom_name: custom_name ?? null,
      custom_target_muscle: custom_target_muscle ?? null,
      // 有酸素はセットの考え方が無いので 1回分の記録にする
      default_sets: isCardio ? 1 : (default_sets ?? 3),
      default_reps: isCardio ? 1 : (default_reps ?? 8),
      sort_order: nextSortOrder,
      is_compound: exercise_master_id && !isCardio ? undefined : (is_compound ?? false),
    })
    .select()
    .single()

  if (error) return dbError('種目の追加に失敗しました', error)

  return NextResponse.json({ exercise: data })
}
