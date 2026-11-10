import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError } from '@/lib/api/errors'

const RenameSchema = z.object({
  display_name: z.string().trim().min(1, '表示名を入力してください').max(40, '表示名は40文字以内で入力してください'),
})

// トレーナーの表示名の変更（2026-11-10 オーナー指摘「登録名のまま変えられないのはきつい」）。
// trainer_profiles には本人の書き込み権限が無いので、本人の確認をしてからサービスロールで書く。
// 登録時に名前を写した自分自身との契約（trainee_display_name）も合わせて変える（自分のトレーニング画面のトレーナー名に出る）
export async function PATCH(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RenameSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const name = parsed.data.display_name

  const service = createServiceClient()
  const { data: updated, error } = await service.from('trainer_profiles').update({ display_name: name }).eq('user_id', user.id).select('user_id')
  if (error) return dbError('表示名の変更に失敗しました', error)
  if (!updated?.length) return NextResponse.json({ error: 'トレーナー登録がありません' }, { status: 404 })

  const { error: linkError } = await service.from('trainer_trainee_links').update({ trainee_display_name: name }).eq('trainer_id', user.id).eq('trainee_id', user.id)
  if (linkError) return dbError('表示名の変更に失敗しました', linkError)
  return NextResponse.json({ ok: true })
}
