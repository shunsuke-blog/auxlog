import type { SupabaseClient } from '@supabase/supabase-js'

export function userExercisesQuery(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('user_exercises')
    .select('*, exercise_master(name, target_muscle, is_bodyweight, is_compound, intensity_technique, requires_one_rm, movement_pattern)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order')
}
