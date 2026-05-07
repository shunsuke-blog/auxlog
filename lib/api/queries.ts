import type { SupabaseClient } from '@supabase/supabase-js'

export function userExercisesQuery(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('user_exercises')
    .select('*, exercise_master(name, target_muscle, is_bodyweight, is_compound)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order')
}
