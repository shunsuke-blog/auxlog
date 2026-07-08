import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { dbError, validationError } from '@/lib/api/errors'
import { z } from 'zod'

// program_composition.tsのPriorityMuscleOption（二頭・三頭を別選択肢化、2026-07-08）
const schema = z.object({
  priority_muscles: z.array(z.enum(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'])).max(2),
})

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return validationError(parsed.error)

  const { error } = await supabase
    .from('user_program_enrollments')
    .update({ priority_muscles: parsed.data.priority_muscles })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) return dbError('優先部位の更新に失敗しました', error)

  return NextResponse.json({ success: true })
}
