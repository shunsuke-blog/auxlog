import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadCoachingRecord } from '@/lib/coaching/record'

// アプリの記録画面（プランの1種目）のデータ。Web の記録画面と同じ（lib/coaching/record.ts）
export async function GET(request: Request, { params }: { params: Promise<{ planExerciseId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planExerciseId } = await params
  const data = await loadCoachingRecord(supabase, user.id, planExerciseId)
  if (!data) return NextResponse.json({ error: '種目が見つかりません' }, { status: 404 })
  return NextResponse.json(data)
}
