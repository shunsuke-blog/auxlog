import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError } from '@/lib/api/errors'

const RegisterTrainerSchema = z.object({
  display_name: z.string().trim().min(1, '表示名を入力してください').max(40, '表示名は40文字以内で入力してください'),
})

// トレーナー登録（trainer_profiles と自分自身との契約の作成）。書き込みは register_as_trainer RPC
// （SECURITY DEFINER、本人限定）で1トランザクションにまとめる（要件定義「権限チェックの方式」）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RegisterTrainerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { error } = await supabase.rpc('register_as_trainer', { p_display_name: parsed.data.display_name })
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'このアカウントではトレーナー登録できません' }, { status: 403 })
    }
    return dbError('トレーナー登録に失敗しました', error)
  }
  return NextResponse.json({ ok: true })
}
