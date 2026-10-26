import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, TRAINER_SUBSCRIPTION_KIND } from '@/lib/trainer/billing'

// プロプランの申し込み（2026-10-26）: Stripe のお支払いページ（Checkout）の URL を返す。
// プランの反映は支払いの後に Webhook が行う（ここでは plan を書き換えない）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripe()
  const priceId = process.env.STRIPE_TRAINER_PRO_PRICE_ID
  if (!stripe || !priceId) return NextResponse.json({ error: '現在お申し込みを受け付けていません' }, { status: 503 })

  const { data: profile } = await supabase
    .from('trainer_profiles')
    .select('display_name, plan, stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'トレーナー登録がありません' }, { status: 403 })
  if (profile.plan !== 'starter') return NextResponse.json({ error: 'すでに有料プランです。プランの変更はお支払いの管理から行えます' }, { status: 409 })

  // Stripe の顧客は1トレーナーに1つ。trainer_profiles への書き込みはサービスロールだけ
  let customerId = profile.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile.display_name,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    const { error } = await createServiceClient().from('trainer_profiles').update({ stripe_customer_id: customerId }).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: 'お申し込みの準備に失敗しました' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { kind: TRAINER_SUBSCRIPTION_KIND, user_id: user.id, plan: 'pro' } },
    locale: 'ja',
    success_url: `${appUrl}/trainer/settings?billing=success`,
    cancel_url: `${appUrl}/trainer/settings`,
  })
  return NextResponse.json({ url: session.url })
}
