import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError, dbError } from '@/lib/api/errors'

const PostSchema = z.object({
  slot_id: z.string().min(1),
})

// ホーム画面のスワイプ削除用。is_hidden（プログラム期間中ずっと非表示、
// slot-assignments/[slot_id]のPATCH）とは別に、現在の週番号だけを記録して
// その週の提案から除外する。week_numberはクライアントの手持ちの週と食い違う
// おそれがあるためサーバー側のenrollment.current_weekを正とする（2026-08-04）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = PostSchema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)
  const { slot_id } = parsed.data

  const { data: enrollment } = await supabase
    .from('user_program_enrollments')
    .select('id, current_week')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'アクティブなプログラムがありません' }, { status: 404 })

  const { error } = await supabase
    .from('user_slot_week_skips')
    .upsert(
      { user_id: user.id, enrollment_id: enrollment.id, slot_id, week_number: enrollment.current_week },
      { onConflict: 'enrollment_id,slot_id,week_number' },
    )

  if (error) return dbError('スキップに失敗しました', error)
  return NextResponse.json({ ok: true })
}
