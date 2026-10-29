import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadCoachingRecord } from '@/lib/coaching/record'

// 代理入力の初期値（2026-10-29）: クライアントの記録画面と同じ（目標のセット、重量が「自動」なら前回の記録の重量）。
// トレーナー本人のセッション（RLS）で読むので、見えるのは担当のクライアントのプランと記録だけ
export async function GET(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const trainee = z.string().uuid().safeParse(url.searchParams.get('trainee'))
  const planExercise = z.string().uuid().safeParse(url.searchParams.get('planExercise'))
  if (!trainee.success || !planExercise.success) return NextResponse.json({ error: '種目が見つかりません' }, { status: 404 })

  const data = await loadCoachingRecord(supabase, trainee.data, planExercise.data)
  if (!data) return NextResponse.json({ error: '種目が見つかりません' }, { status: 404 })
  return NextResponse.json(data)
}
