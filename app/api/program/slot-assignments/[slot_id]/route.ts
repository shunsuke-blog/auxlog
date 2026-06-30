import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slot_id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slot_id } = await params
  const { enrollment_id, is_hidden } = await request.json()
  if (!enrollment_id || typeof is_hidden !== 'boolean') {
    return NextResponse.json({ error: 'enrollment_id と is_hidden が必要です' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_slot_assignments')
    .update({ is_hidden })
    .eq('slot_id', slot_id)
    .eq('enrollment_id', enrollment_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
