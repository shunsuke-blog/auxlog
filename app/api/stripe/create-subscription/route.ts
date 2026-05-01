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
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_customer_id) {
    return NextResponse.json({ message: 'Already has subscription' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const customer = await stripe.customers.create({
    email: userData?.email ?? user.email ?? '',
    metadata: { supabase_user_id: user.id },
  })

  await supabase
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id)

  return NextResponse.json({ customer_id: customer.id })
}
