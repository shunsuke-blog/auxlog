import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/trainer/billing'

// お支払いの管理（2026-10-26）: Stripe のお客様ポータル（カードの変更・解約・領収書）の URL を返す
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: '現在ご利用いただけません' }, { status: 503 })

  const { data: profile } = await supabase.from('trainer_profiles').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'お支払いの情報がありません' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/trainer/settings`,
    locale: 'ja',
  })
  return NextResponse.json({ url: session.url })
}
