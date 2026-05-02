import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createClient()

  // サブスクリプション作成時: trial_ends_at を保存
  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null

    await supabase
      .from('users')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        ...(trialEnd ? { trial_ends_at: trialEnd } : {}),
      })
      .eq('stripe_customer_id', customerId)
  }

  // ステータス変更・更新時: status と trial_ends_at を同期
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null

    await supabase
      .from('users')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: status,
        ...(trialEnd ? { trial_ends_at: trialEnd } : {}),
      })
      .eq('stripe_customer_id', customerId)
  }

  // トライアル終了3日前: 通知フラグを立てる（メール送信はフェーズ2）
  if (event.type === 'customer.subscription.trial_will_end') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    await supabase
      .from('users')
      .update({ trial_ending_notification_sent: true })
      .eq('stripe_customer_id', customerId)
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string

    await supabase
      .from('users')
      .update({ subscription_status: 'past_due' })
      .eq('stripe_customer_id', customerId)
  }

  return NextResponse.json({ received: true })
}
