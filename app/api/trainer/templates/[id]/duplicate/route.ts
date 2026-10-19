import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const DuplicateSchema = z.object({ name: z.string().trim().min(1).max(60) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = DuplicateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { id } = await params
  const { data, error } = await supabase.rpc('duplicate_plan_template', { p_plan_id: id, p_name: parsed.data.name })
  if (error) return trainerRpcError(error, 'テンプレートの複製に失敗しました')
  return NextResponse.json({ id: data })
}
