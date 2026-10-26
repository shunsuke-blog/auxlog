import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, priceIdOf, syncTrainerSubscription } from '@/lib/trainer/billing'

const ChangeSchema = z.object({ plan: z.enum(['pro', 'business']) })

// プロ⇔ビジネスの切り替え（2026-10-26 オーナー決定: 日割りで差額を次の請求で精算）。
// Stripe のサブスクの価格を差し替え、画面にすぐ出るようその場でも反映する（Webhook でも同じ内容が届く）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ChangeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '入力値が正しくありません' }, { status: 400 })
  const stripe = getStripe()
  const priceId = priceIdOf(parsed.data.plan)
  if (!stripe || !priceId) return NextResponse.json({ error: '現在ご利用いただけません' }, { status: 503 })

  const { data: profile } = await supabase.from('trainer_profiles').select('plan, stripe_subscription_id, business_allowed').eq('user_id', user.id).maybeSingle()
  if (!profile?.stripe_subscription_id || profile.plan === 'starter') {
    return NextResponse.json({ error: '有料プランの契約がありません' }, { status: 409 })
  }
  if (profile.plan === parsed.data.plan) return NextResponse.json({ ok: true })
  // ビジネスはお問い合わせ制（運営が許可したトレーナーだけ）
  if (parsed.data.plan === 'business' && !profile.business_allowed) {
    return NextResponse.json({ error: 'ビジネスプランはお問い合わせのうえでお申し込みいただけます' }, { status: 403 })
  }

  const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
  const item = sub.items.data[0]
  if (!item) return NextResponse.json({ error: '契約の情報を読み込めませんでした' }, { status: 500 })
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: 'create_prorations',
    metadata: { ...sub.metadata, plan: parsed.data.plan },
  })
  await syncTrainerSubscription(stripe, createServiceClient(), sub.id)
  return NextResponse.json({ ok: true })
}
