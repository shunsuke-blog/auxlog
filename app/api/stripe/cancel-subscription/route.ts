import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
  }

  const status = userData.subscription_status
  if (status === 'canceled' || status === 'canceling') {
    return NextResponse.json({ message: 'Already canceling' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  let subscription
  try {
    subscription = await stripe.subscriptions.update(userData.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cancel-subscription] Stripe error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // period_end を期限として保存
  const sub = subscription as unknown as { current_period_end?: number; trial_end?: number | null }
  const serviceEndsAt = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : (sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null)

  await supabase
    .from('users')
    .update({
      subscription_status: 'canceling',
      ...(serviceEndsAt ? { trial_ends_at: serviceEndsAt } : {}),
    })
    .eq('id', user.id)

  return NextResponse.json({ success: true, ends_at: serviceEndsAt })
}
