import type { SupabaseClient } from '@supabase/supabase-js'

// トレーナーが一覧の自分の行から「自分のトレーニング」に入っている間だけ立てるCookie。
// 立っていなければ、トレーナーがトレーニー用の画面を開いてもトレーナー画面（/trainer）へ戻す。
export const SELF_VIEW_COOKIE = 'auxlog_trainer_self_view'

export type TrainerPlan = 'starter' | 'basic' | 'pro' | 'business'

export type TrainerProfile = { user_id: string; display_name: string; plan: TrainerPlan }

// trainer_profiles に行があればトレーナー（RLSで本人の行だけ読める）。
export async function getTrainerProfile(supabase: SupabaseClient, userId: string): Promise<TrainerProfile | null> {
  const { data } = await supabase
    .from('trainer_profiles')
    .select('user_id, display_name, plan')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? null
}

// ログイン後の戻り先として受け付けるのはサイト内のパスだけ（オープンリダイレクト対策）。
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
