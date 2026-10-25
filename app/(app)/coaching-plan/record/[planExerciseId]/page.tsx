import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loadCoachingRecord } from '@/lib/coaching/record'
import CoachingRecordClient from './CoachingRecordClient'

// コーチングモードの記録画面（プランの1種目）。データの読み込みは lib/coaching/record.ts（アプリ用 API と共通）
export default async function CoachingRecordPage({ params }: { params: Promise<{ planExerciseId: string }> }) {
  const { planExerciseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await loadCoachingRecord(supabase, user.id, planExerciseId)
  if (!data) notFound()
  return <CoachingRecordClient {...data} />
}
