import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadTemplateOneRmExercises } from '@/lib/trainer/templateOneRm'

// トレーニー追加のダイアログで、選んだテンプレートの1RMを聞く種目を返す（RLS で自分のテンプレートだけ読める）
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  return NextResponse.json({ exercises: await loadTemplateOneRmExercises(supabase, id) })
}
