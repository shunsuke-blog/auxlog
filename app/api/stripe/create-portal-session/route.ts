import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // stripe_customer_id がなければ Customer を新規作成して DB に保存
  let customerId = userData?.stripe_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData?.email ?? user.email ?? '',
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const origin = request.headers.get('origin')
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? 'https://auxlog.app'

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
