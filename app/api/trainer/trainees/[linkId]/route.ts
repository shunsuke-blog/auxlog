import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'

const RenameSchema = z.object({ display_name: z.string().trim().min(1).max(40) })

// 契約者の名前の変更（トレーナーだけが見る呼び名、2026-10-25）
export async function PATCH(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = RenameSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const { linkId } = await params
  const { error } = await supabase.rpc('rename_trainee_link', { p_link_id: linkId, p_display_name: parsed.data.display_name })
  if (error) return trainerRpcError(error, '名前の変更に失敗しました')
  return NextResponse.json({ ok: true })
}
