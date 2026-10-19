import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const RenameSchema = z.object({ name: z.string().trim().min(1).max(60) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RenameSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { id } = await params
  const { error } = await supabase.rpc('rename_plan_template', { p_plan_id: id, p_name: parsed.data.name })
  if (error) return trainerRpcError(error, 'テンプレート名の変更に失敗しました')
  return NextResponse.json({ ok: true })
}

// テンプレートを消しても、トレーニーと共有済みのプラン（複製）は残る。
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.rpc('delete_plan_template', { p_plan_id: id })
  if (error) return trainerRpcError(error, 'テンプレートの削除に失敗しました')
  return NextResponse.json({ ok: true })
}
