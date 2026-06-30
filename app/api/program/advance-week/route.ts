import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api/errors'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })
  if (enrollment.current_week >= 9) {
    return NextResponse.json({ error: 'プログラムは既に最終週です' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('user_program_enrollments')
    .update({ current_week: enrollment.current_week + 1 })
    .eq('id', enrollment.id)
    .select()
    .single()

  if (error || !updated) return dbError('週の更新に失敗しました', error)

  return NextResponse.json({ current_week: updated.current_week })
}
