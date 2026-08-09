import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('user_custom_slots')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return dbError('種目の削除に失敗しました', error)
  return NextResponse.json({ ok: true })
}
