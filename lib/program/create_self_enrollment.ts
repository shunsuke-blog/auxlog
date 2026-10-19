import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PROGRAM_ID } from '@/lib/constants/api'

// セルフモードのプログラム（enrollment）を作る。オンボーディング（api/program/enroll）と、
// トレーナーとの契約終了後の自動作成（lib/program/auto_self_program.ts）で共通。
// 呼び出し側で入力値の検証（スロットIDの妥当性など）と「契約中ではないこと」の確認を済ませておく。

export type SelfEnrollmentInput = {
  days_per_week: 2 | 3 | 4
  session_duration_minutes: 60 | 75 | 90
  priority_muscles: string[]
  slot_assignments: { slot_id: string; exercise_name: string }[]
  one_rms: { slot_id: string; one_rm_kg: number; source: 'manual_input' | 'epley_estimated' }[]
}

export type SelfEnrollmentResult =
  | { enrollmentId: string }
  | { error: string; status: number; cause?: unknown }

const todayJST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

function fail(error: string, cause?: unknown): SelfEnrollmentResult {
  return { error, status: 500, cause }
}

export async function createSelfEnrollment(
  supabase: SupabaseClient,
  userId: string,
  input: SelfEnrollmentInput,
): Promise<SelfEnrollmentResult> {
  const { days_per_week, session_duration_minutes, priority_muscles, slot_assignments, one_rms } = input

  // アクティブなエンロールメントが既に存在する場合はエラー
  const { data: existing } = await supabase
    .from('user_program_enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) return { error: 'すでにアクティブなプログラムがあります', status: 400 }

  // エンロールメント作成
  const { data: enrollment, error: enrollError } = await supabase
    .from('user_program_enrollments')
    .insert({
      user_id: userId,
      program_id: DEFAULT_PROGRAM_ID,
      days_per_week,
      session_duration_minutes,
      priority_muscles,
      started_at: todayJST(),
    })
    .select()
    .single()

  if (enrollError || !enrollment) return fail('プログラム登録に失敗しました', enrollError)

  // スロット割り当て処理（N+1回避: 事前一括取得 → ローカル解決 → バルク insert）
  const uniqueNames = [...new Set(slot_assignments.map(a => a.exercise_name))]

  const [{ data: masters }, { data: existingUes }, { data: maxSortRow }] = await Promise.all([
    supabase.from('exercise_master').select('id, name, is_compound').in('name', uniqueNames),
    supabase.from('user_exercises').select('id, exercise_master_id, is_active').eq('user_id', userId),
    supabase.from('user_exercises').select('sort_order').eq('user_id', userId)
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
      .eq('user_id', userId)
    if (reactivateError) return fail('種目の再有効化に失敗しました', reactivateError)
  }

  // 未登録分を収集してバルク insert
  const toInsert: { name: string; row: Record<string, unknown> }[] = []
  for (const name of uniqueNames) {
    if (exerciseIdByName.has(name)) continue
    const master = masterByName.get(name)
    if (master) {
      toInsert.push({
        name,
        row: { user_id: userId, exercise_master_id: master.id, sort_order: nextSort++, is_compound: master.is_compound },
      })
    } else {
      toInsert.push({
        name,
        row: { user_id: userId, custom_name: name, sort_order: nextSort++, is_compound: false },
      })
    }
  }

  if (toInsert.length > 0) {
    const { data: newUes, error: ueError } = await supabase
      .from('user_exercises')
      .insert(toInsert.map(t => t.row))
      .select('id')
    if (ueError || !newUes) return fail('種目の追加に失敗しました', ueError)
    toInsert.forEach((t, i) => exerciseIdByName.set(t.name, newUes[i].id))
  }

  // user_slot_assignments をバルク insert
  const slotRows = slot_assignments.map(a => ({
    user_id: userId,
    enrollment_id: enrollment.id,
    slot_id: a.slot_id,
    exercise_id: exerciseIdByName.get(a.exercise_name)!,
  }))

  const { error: saError } = await supabase.from('user_slot_assignments').insert(slotRows)
  if (saError) return fail('スロット割り当てに失敗しました', saError)

  // 1RM 登録
  // 新方式(program_composition.ts)ではchest_press一本化のため、旧chest_triceps_compound
  // フォールバック（chest_compoundの1RMを流用する処理）は不要になった（2026-07-08削除）。
  if (one_rms.length > 0) {
    const { error: ormError } = await supabase
      .from('user_slot_one_rms')
      .insert(
        one_rms.map(orm => ({
          user_id: userId,
          slot_id: orm.slot_id,
          one_rm_kg: orm.one_rm_kg,
          recorded_at: todayJST(),
          source: orm.source,
        }))
      )

    if (ormError) return fail('1RM の登録に失敗しました', ormError)
  }

  return { enrollmentId: enrollment.id }
}
