import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { validationError } from '@/lib/api/errors'

// トレーナー画面のお問い合わせ（2026-10-26 オーナー指摘: メールアプリを開かずに、人数を入れて送るだけにする）。
// ビジネスプランの申し込みと、トレーナー枠の追加。運営のメールに届き、返信先はお客様のアドレス。
const schema = z.object({
  kind: z.enum(['business', 'seats']),
  trainers: z.number().int().min(1).max(999),
  message: z.string().trim().max(2000).optional(),
})

const SUBJECTS = {
  business: 'ビジネスプランのお問い合わせ',
  seats: 'トレーナー枠の追加',
} as const

const COUNT_LABELS = {
  business: 'ご利用予定のトレーナー人数',
  seats: '追加したいトレーナーの人数',
} as const

export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const { kind, trainers, message } = parsed.data

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'メール送信が設定されていません' }, { status: 500 })
  }

  const profile = await getTrainerProfile(supabase, user.id)
  const lines = [
    `差出人: ${profile?.display_name ?? '（未登録）'} <${user.email}>`,
    `ユーザーID: ${user.id}`,
    `現在のプラン: ${profile?.plan ?? '（未登録）'}`,
    `${COUNT_LABELS[kind]}: ${trainers}名`,
    '',
    message || '（メッセージなし）',
  ]

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: 'Auxlog <noreply@bloomines.com>',
    to: 'auxlog.support@gmail.com',
    replyTo: user.email,
    subject: `[トレーナー] ${SUBJECTS[kind]}`,
    text: lines.join('\n'),
  })
  if (error) {
    console.error('[trainer-inquiry] send failed', error)
    return NextResponse.json({ error: '送信に失敗しました。時間をおいてもう一度お試しください' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
