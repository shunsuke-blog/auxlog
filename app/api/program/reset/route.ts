import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // slot_assignments は enrollment の CASCADE DELETE で消えるが念のため先に削除
  await supabase
    .from('user_slot_assignments')
    .delete()
    .eq('user_id', user.id)

  // enrollment を全削除（is_active に関わらず）
  const { error: enrollError } = await supabase
    .from('user_program_enrollments')
    .delete()
    .eq('user_id', user.id)

  if (enrollError) {
    return NextResponse.json({ error: 'リセットに失敗しました' }, { status: 500 })
  }

  // one_rms も削除（enrollment とは別テーブル）
  const { error: ormError } = await supabase
    .from('user_slot_one_rms')
    .delete()
    .eq('user_id', user.id)

  if (ormError) {
    return NextResponse.json({ error: 'リセット中にエラーが発生しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
