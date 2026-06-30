import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'
import { DEFAULT_PROGRAM_ID } from '@/lib/constants/api'
import { z } from 'zod'

const VALID_SLOT_IDS = new Set([
  'chest_compound', 'back_vertical_pull', 'back_horizontal_pull',
  'shoulder_lateral', 'shoulder_rear_delt', 'triceps', 'biceps',
  'quad_glute_primary', 'hamstring_glute', 'quad_ham_glute',
  'calves_seated', 'core',
  'shoulder_vertical_press', 'chest_triceps_compound',
  'back_horizontal_pull_heavy', 'back_vertical_pull_alt',
  'chest_isolation', 'shoulder_lateral_cable', 'biceps_alt',
  'hamstring_glute_heavy', 'quad_glute_secondary',
  'calves_standing', 'core_alt',
])

const EnrollSchema = z.object({
  days_per_week: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  session_duration_minutes: z.union([z.literal(60), z.literal(75), z.literal(90)]),
  slot_assignments: z.array(z.object({
    slot_id: z.string().refine(id => VALID_SLOT_IDS.has(id), { message: '不正なスロットIDです' }),
    exercise_name: z.string().min(1).max(100),
  })).min(1),
  one_rms: z.array(z.object({
    slot_id: z.string().refine(id => VALID_SLOT_IDS.has(id), { message: '不正なスロットIDです' }),
    one_rm_kg: z.number().positive().max(1000),
    source: z.enum(['manual_input', 'epley_estimated']),
  })),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = EnrollSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' }, { status: 400 })
  }
  const { days_per_week, session_duration_minutes, slot_assignments, one_rms } = parsed.data

  // アクティブなエンロールメントが既に存在する場合はエラー
  const { data: existing } = await supabase
    .from('user_program_enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'すでにアクティブなプログラムがあります' }, { status: 400 })
  }

  // エンロールメント作成
  const { data: enrollment, error: enrollError } = await supabase
    .from('user_program_enrollments')
    .insert({
      user_id: user.id,
      program_id: DEFAULT_PROGRAM_ID,
      days_per_week,
      session_duration_minutes,
      started_at: new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (enrollError || !enrollment) return dbError('プログラム登録に失敗しました', enrollError)

  // スロット割り当て処理（N+1回避: 事前一括取得 → ローカル解決 → バルク insert）
  const uniqueNames = [...new Set(slot_assignments.map(a => a.exercise_name))]

  const [{ data: masters }, { data: existingUes }, { data: maxSortRow }] = await Promise.all([
    supabase.from('exercise_master').select('id, name, is_compound').in('name', uniqueNames),
    supabase.from('user_exercises').select('id, exercise_master_id, is_active').eq('user_id', user.id),
    supabase.from('user_exercises').select('sort_order').eq('user_id', user.id)
      .order('sort_order', { ascending: false }).limit(1),
  ])

  const masterByName = new Map((masters ?? []).map(m => [m.name, m]))
  const ueByMasterId = new Map((existingUes ?? []).map(e => [e.exercise_master_id as string, e.id]))
  const ueIsActiveById = new Map((existingUes ?? []).map(e => [e.id as string, e.is_active as boolean]))
  let nextSort = (maxSortRow?.[0]?.sort_order ?? 0) + 1

  // 名前 → user_exercise.id のマップを構築（未登録分はまとめて作成）
  const exerciseIdByName = new Map<string, string>()

  // 既存マスタ種目でユーザーに登録済みのものを先に埋める
  for (const name of uniqueNames) {
    const master = masterByName.get(name)
    if (master) {
      const existingId = ueByMasterId.get(master.id)
      if (existingId) exerciseIdByName.set(name, existingId)
    }
  }

  // 再エンロール時に soft-delete された種目を reactivate する
  const reactivateIds = [...exerciseIdByName.values()].filter(id => ueIsActiveById.get(id) === false)
  if (reactivateIds.length > 0) {
    const { error: reactivateError } = await supabase
      .from('user_exercises')
      .update({ is_active: true })
      .in('id', reactivateIds)
      .eq('user_id', user.id)
    if (reactivateError) return dbError('種目の再有効化に失敗しました', reactivateError)
  }

  // 未登録分を収集してバルク insert
  const toInsert: { name: string; row: Record<string, unknown> }[] = []
  for (const name of uniqueNames) {
    if (exerciseIdByName.has(name)) continue
    const master = masterByName.get(name)
    if (master) {
      toInsert.push({
        name,
        row: { user_id: user.id, exercise_master_id: master.id, sort_order: nextSort++, is_compound: master.is_compound },
      })
    } else {
      toInsert.push({
        name,
        row: { user_id: user.id, custom_name: name, sort_order: nextSort++, is_compound: false },
      })
    }
  }

  if (toInsert.length > 0) {
    const { data: newUes, error: ueError } = await supabase
      .from('user_exercises')
      .insert(toInsert.map(t => t.row))
      .select('id')
    if (ueError || !newUes) return dbError('種目の追加に失敗しました', ueError)
    toInsert.forEach((t, i) => exerciseIdByName.set(t.name, newUes[i].id))
  }

  // user_slot_assignments をバルク insert
  const slotRows = slot_assignments.map(a => ({
    user_id: user.id,
    enrollment_id: enrollment.id,
    slot_id: a.slot_id,
    exercise_id: exerciseIdByName.get(a.exercise_name)!,
  }))

  const { error: saError } = await supabase.from('user_slot_assignments').insert(slotRows)
  if (saError) return dbError('スロット割り当てに失敗しました', saError)

  // 1RM 登録
  // chest_triceps_compound はオンボーディングで収集しないため、
  // chest_compound の 1RM をそのまま流用する（スプレッドシートの設計に準拠）
  const finalOneRms = [...one_rms]
  const chestOneRm = one_rms.find(o => o.slot_id === 'chest_compound')
  if (chestOneRm && !one_rms.some(o => o.slot_id === 'chest_triceps_compound')) {
    finalOneRms.push({
      slot_id: 'chest_triceps_compound',
      one_rm_kg: chestOneRm.one_rm_kg,
      source: 'manual_input',
    })
  }

  if (finalOneRms.length > 0) {
    const { error: ormError } = await supabase
      .from('user_slot_one_rms')
      .insert(
        finalOneRms.map(orm => ({
          user_id: user.id,
          slot_id: orm.slot_id,
          one_rm_kg: orm.one_rm_kg,
          recorded_at: new Date().toISOString().split('T')[0],
          source: orm.source,
        }))
      )

    if (ormError) return dbError('1RM の登録に失敗しました', ormError)
  }

  return NextResponse.json({ enrollment_id: enrollment.id })
}
