import type { SupabaseClient } from '@supabase/supabase-js'

type Result = { id: string; error?: undefined } | { id?: undefined; error: string }

// 指定した exercise_master に対応する user_exercises を返す。無ければ作成する（sort_orderは末尾に追加）。
// スロットの種目差し替えなど、1件単位の操作向け（enroll時のバルク登録はenroll/route.ts側の
// 専用ロジックを使う。N+1回避のため事前一括取得しており、こちらとは実装を分けている）。
export async function findOrCreateUserExercise(
  supabase: SupabaseClient,
  userId: string,
  masterId: string,
  isCompound: boolean
): Promise<Result> {
  const [{ data: existing, error: findError }, { data: maxSortRow }] = await Promise.all([
    supabase
      .from('user_exercises')
      .select('id')
      .eq('user_id', userId)
      .eq('exercise_master_id', masterId)
      .maybeSingle(),
    supabase
      .from('user_exercises')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1),
  ])

  if (findError) return { error: '種目の確認に失敗しました' }
  if (existing) return { id: existing.id }

  const { data: created, error: insertError } = await supabase
    .from('user_exercises')
    .insert({
      user_id: userId,
      exercise_master_id: masterId,
      sort_order: (maxSortRow?.[0]?.sort_order ?? 0) + 1,
      is_compound: isCompound,
    })
    .select('id')
    .single()

  if (insertError || !created) return { error: '種目の追加に失敗しました' }
  return { id: created.id }
}
