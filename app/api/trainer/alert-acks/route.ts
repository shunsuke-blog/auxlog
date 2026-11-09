import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError, dbError } from '@/lib/api/errors'

const AckSchema = z.object({ link_id: z.string().uuid(), alert_key: z.string().min(1).max(200) })

// ダッシュボードのアラートの「確認した」（2026-11-09 オーナー決定: トレーナーごと）。押したトレーナーの画面からだけ消える。
// DB は lib/sql/trainer_alert_acks_2026-11-09.sql（自分の担当・チームのクライアントの分だけ書ける）
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = AckSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { error } = await supabase
    .from('trainer_alert_acks')
    .upsert({ trainer_id: user.id, link_id: parsed.data.link_id, alert_key: parsed.data.alert_key }, { onConflict: 'trainer_id,link_id,alert_key', ignoreDuplicates: true })
  if (error) return dbError('確認済みにできませんでした', error)
  return NextResponse.json({ ok: true })
}
