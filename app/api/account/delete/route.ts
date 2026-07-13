import { createClient, createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'

// アカウント削除。usersテーブル以下の全テーブルはauth.users(id)へON DELETE CASCADEで
// 紐付いているため、admin.deleteUser()一発で記録・プログラム・1RM等すべて連鎖削除される
// （training_sessions/training_sets/user_exercises/exercise_bests/user_slot_one_rms/
// user_program_enrollments/user_slot_assignments/user_program_day_extras）。
export async function DELETE(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.subscriptions.cancel(userData.stripe_subscription_id)
    } catch (err) {
      // 既に解約済み等でエラーになってもアカウント削除自体は継続する
      console.error('[account/delete] Stripe解約失敗:', err instanceof Error ? err.message : String(err))
    }
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account/delete] ユーザー削除失敗:', error.message)
    return NextResponse.json({ error: 'アカウントの削除に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
