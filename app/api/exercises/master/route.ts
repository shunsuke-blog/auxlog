import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 有酸素の種目は別の表（cardio_master、2026-10-26）。公開中の古いアプリは exercise_master を直接読むので、そこには入れていない
  const [{ data, error }, { data: cardio }] = await Promise.all([
    supabase.from('exercise_master').select('*').order('sort_order'),
    supabase.from('cardio_master').select('*').order('sort_order'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exercises: data ?? [], cardio: cardio ?? [] })
}
