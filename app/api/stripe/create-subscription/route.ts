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
    .select('stripe_customer_id, stripe_subscription_id, email')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_subscription_id) {
    return NextResponse.json({ message: 'Already has subscription' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // 既存CustomerがあればそのまM利用、なければ新規作成（カード不要）
  let customerId = userData?.stripe_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData?.email ?? user.email ?? '',
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
  }

  let subscription
  try {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      trial_period_days: 30,
      payment_settings: { save_default_payment_method: 'on_subscription' },
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[create-subscription] Stripe error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null

  await supabase
    .from('users')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      ...(trialEnd ? { trial_ends_at: trialEnd } : {}),
    })
    .eq('id', user.id)

  return NextResponse.json({ subscription_id: subscription.id })
}
