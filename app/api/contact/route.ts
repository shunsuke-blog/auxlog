import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { z } from 'zod'

const schema = z.object({
  category: z.enum(['bug', 'feature', 'other']),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
})

const CATEGORY_LABELS: Record<string, string> = {
  bug: '不具合報告',
  feature: '機能要望',
  other: 'その他',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json()
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { category, subject, body } = parsed.data

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'メール送信が設定されていません' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: 'Auxlog <noreply@bloomines.com>',
    to: 'auxlog.support@gmail.com',
    replyTo: user.email,
    subject: `[${CATEGORY_LABELS[category]}] ${subject}`,
    text: `差出人: ${user.email}\nカテゴリ: ${CATEGORY_LABELS[category]}\n\n${body}`,
  })

  if (error) {
    return NextResponse.json({ error: '送信に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
