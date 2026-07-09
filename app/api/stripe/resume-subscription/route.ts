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

  if (!userData?.stripe_subscription_id || userData.subscription_status !== 'canceling') {
    return NextResponse.json({ error: 'Not in canceling state' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const subscription = await stripe.subscriptions.update(userData.stripe_subscription_id, {
      cancel_at_period_end: false,
    })
    // Supabaseクライアントはクエリ失敗時に例外を投げないため、このtry/catchはStripe呼び出しの
    // 失敗しか捕捉できていなかった。Stripe側は既に成立しているため、DB書き込み失敗時も
    // 5xxにはせずログのみ残す（customer.subscription.updatedのWebhookが後追いで修正する、
    // 2026-07-09コードレビュー対応）。
    const { error: saveError } = await supabase
      .from('users')
      .update({ subscription_status: subscription.status })
      .eq('id', user.id)
    if (saveError) {
      console.error('[resume-subscription] subscription状態の保存失敗:', saveError.message)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
