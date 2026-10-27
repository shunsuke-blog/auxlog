import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { getStripe, priceIdOf, TRAINER_SUBSCRIPTION_KIND } from '@/lib/trainer/billing'
import { getTeamContext } from '@/lib/trainer/team'

const CheckoutSchema = z.object({ plan: z.enum(['basic', 'pro', 'business']).default('pro') })

// プロ・ビジネスの申し込み（2026-10-26）: Stripe のお支払いページ（Checkout）の URL を返す。
// プランの反映は支払いの後に Webhook が行う（ここでは plan を書き換えない）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = CheckoutSchema.parse(await request.json().catch(() => ({})))
  const stripe = getStripe()
  const priceId = priceIdOf(plan)
  if (!stripe || !priceId) return NextResponse.json({ error: '現在お申し込みを受け付けていません' }, { status: 503 })

  const { data: profile } = await supabase
    .from('trainer_profiles')
    .select('display_name, plan, stripe_customer_id, business_allowed')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'トレーナー登録がありません' }, { status: 403 })
  if (profile.plan !== 'starter') return NextResponse.json({ error: 'すでに有料プランです。プランの切り替えは設定の「プラン」から行えます' }, { status: 409 })
  // ビジネスはお問い合わせ制: 運営が許可したトレーナーだけ（管理者用の登録ページで許可される）
  if (plan === 'business' && !profile.business_allowed) {
    return NextResponse.json({ error: 'ビジネスプランはお問い合わせのうえでお申し込みいただけます' }, { status: 403 })
  }
  // チームのメンバーはチームのビジネスプランで使える（二重に払わない）
  const team = await getTeamContext(supabase, user.id)
  if (team.role === 'member' || team.role === 'pending') {
    return NextResponse.json({ error: 'チームに参加中（申請中を含む）のため、ご自身での申し込みは不要です' }, { status: 409 })
  }

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
    subscription_data: { metadata: { kind: TRAINER_SUBSCRIPTION_KIND, user_id: user.id, plan } },
    locale: 'ja',
    // ビジネスは支払いの後にチームを作る画面へ（名前・自分も担当するかを選ぶ）
    success_url: plan === 'business' ? `${appUrl}/trainer/team-setup?welcome=1` : `${appUrl}/trainer/settings?billing=success`,
    cancel_url: `${appUrl}/trainer/settings`,
  })
  return NextResponse.json({ url: session.url })
}
