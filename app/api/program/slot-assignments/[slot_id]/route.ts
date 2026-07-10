import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError, notFound } from '@/lib/api/errors'
import { VALID_CATEGORY_IDS, BASE_CATEGORIES_BY_RANK, LEG_DEFAULT_CATEGORY, type CompositionCategory } from '@/lib/constants/program_composition'
import { findOrCreateUserExercise } from '@/lib/program/find_or_create_user_exercise'

const CATEGORY_BY_ID = new Map<string, CompositionCategory>(
  [...BASE_CATEGORIES_BY_RANK.values(), LEG_DEFAULT_CATEGORY].map(c => [c.id, c]),
)

const PatchSchema = z.object({
  enrollment_id: z.string().min(1),
  is_hidden: z.boolean().optional(),
  exercise_name: z.string().min(1).max(100).optional(),
}).refine(data => data.is_hidden !== undefined || data.exercise_name !== undefined, {
  message: 'is_hidden か exercise_name のいずれかが必要です',
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slot_id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slot_id } = await params
  if (!VALID_CATEGORY_IDS.has(slot_id)) {
    return NextResponse.json({ error: '不正なスロットIDです' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const { enrollment_id, is_hidden, exercise_name } = parsed.data

  const updates: Record<string, unknown> = {}
  if (is_hidden !== undefined) updates.is_hidden = is_hidden

  if (exercise_name !== undefined) {
    // このスロットで選択可能な種目かどうかを検証。movementPatternを持つカテゴリは
    // それで一致するものだけ許可し（腕の二頭/三頭、肩のプレス/側方/後部などを混同しないため）、
    // movementPatternを持たないカテゴリのみ部位一致で許可する。movementPatternは
    // 配列指定も可能（例: 脚2種目目のスクワット or ヒップヒンジ、2026-07-10）
    // （2026-07-08、brainstorm #3の「動きパターンでは絞らない」を撤回。OnboardingClient.tsxの
    // matchingExercisesと同じロジック）。
    const category = CATEGORY_BY_ID.get(slot_id)!
    const patterns = category.movementPattern
      ? (Array.isArray(category.movementPattern) ? category.movementPattern : [category.movementPattern])
      : null
    let query = supabase
      .from('exercise_master')
      .select('id, is_compound')
      .eq('name', exercise_name)
    query = patterns
      ? query.in('movement_pattern', patterns)
      : query.eq('target_muscle', category.muscle)
    const { data: master, error: masterError } = await query.maybeSingle()

    if (masterError) return dbError('種目の確認に失敗しました', masterError)
    if (!master) return NextResponse.json({ error: 'このスロットでは選択できない種目です' }, { status: 400 })

    const result = await findOrCreateUserExercise(supabase, user.id, master.id, master.is_compound)
    if (result.error) return dbError(result.error)

    updates.exercise_id = result.id
  }

  const { data, error } = await supabase
    .from('user_slot_assignments')
    .update(updates)
    .eq('slot_id', slot_id)
    .eq('enrollment_id', enrollment_id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return dbError('スロットの更新に失敗しました', error)
  if (!data || data.length === 0) return notFound('対象のスロット割り当てが見つかりません')

  return NextResponse.json({ ok: true })
}
