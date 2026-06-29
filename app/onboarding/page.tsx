import { createClient } from '@/lib/supabase/server'
import OnboardingClient, { type ExerciseMasterRow } from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('exercise_master')
    .select('id, name, target_muscle, slot_type')
    .not('slot_type', 'is', null)
    .order('sort_order')

  const exercises: ExerciseMasterRow[] = (data ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    target_muscle: r.target_muscle as string,
    slot_type: r.slot_type as string,
  }))

  return <OnboardingClient exercises={exercises} />
}
