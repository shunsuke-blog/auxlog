import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // 新規ユーザーの場合はStripeトライアルを開始
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('stripe_customer_id')
          .eq('id', user.id)
          .single()

        if (userData && !userData.stripe_customer_id) {
          // Stripeトライアル開始（非同期で実行）
          await fetch(`${origin}/api/stripe/create-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
