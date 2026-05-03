import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // 既にアクティブ or トライアル中なら何もしない
  const status = userData.subscription_status
  if (status === 'active' || status === 'trialing') {
    return NextResponse.json({ message: 'Already active' })
  }

  let subscription
  try {
    // トライアルなしで新規サブスクリプションを作成
    subscription = await stripe.subscriptions.create({
      customer: userData.stripe_customer_id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      payment_settings: { save_default_payment_method: 'on_subscription' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reactivate-subscription] Stripe error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await supabase
    .from('users')
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
    })
    .eq('id', user.id)

  return NextResponse.json({ subscription_id: subscription.id })
}
