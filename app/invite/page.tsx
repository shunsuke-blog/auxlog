import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTraineeLink } from '@/lib/coaching/trainee'
import InviteForm from './InviteForm'

// トレーナーから受け取った招待コードの入力（オンボーディングと設定から入る）
export default async function InvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/invite')

  const [link, { data: enrollment }] = await Promise.all([
    getTraineeLink(supabase, user.id),
    supabase.from('user_program_enrollments').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ])

  return <InviteForm currentTrainerName={link && !link.isSelf ? link.trainerName : null} hasSelfProgram={!!enrollment} />
}
