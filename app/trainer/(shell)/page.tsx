import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadTraineeRows } from '@/lib/trainer/trainees'
import TraineeListItem from './TraineeListItem'
import TraineeDetailPanel from './TraineeDetailPanel'
import AddTraineeButton, { type TemplateOption } from './AddTraineeButton'
import { MUSCLE_ORDER, type TargetMuscle } from '@/types'

type TemplateRow = {
  id: string
  name: string
  plan_days: {
    plan_exercises: {
      exercise_master_id: string | null
      trainer_exercise_id: string | null
      exercise_master: { name: string; target_muscle: string | null; sort_order: number } | null
      trainer_exercises: { name: string; target_muscle: string | null } | null
      plan_sets: { target_pct_1rm: number | null }[]
    }[]
  }[]
}

// トレーニー一覧（2026-10-19 決定）: 一番上に自分自身、その下にトレーニー。契約終了はグレーで一番下。
// 名前・状態・最後に記録した日・今週の進み具合（4 / 6 種目＋バー、スキップは別表示）・アラート「！」。
// PCは左に一覧・右に詳細（?id=）、スマホは一覧 → 詳細に切り替わる。
export default async function TrainerTraineesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: selectedId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [profile, rows, { data: templates }] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    loadTraineeRows(supabase, user.id),
    supabase
      .from('coaching_plans')
      .select('id, name, plan_days(plan_exercises(exercise_master_id, trainer_exercise_id, exercise_master(name, target_muscle, sort_order), trainer_exercises(name, target_muscle), plan_sets(target_pct_1rm)))')
      .is('link_id', null)
      .order('updated_at', { ascending: false }),
  ])

  // トレーニー追加時に1RMを聞く種目 = テンプレート内で %1RM を使っている種目
  const templateOptions: TemplateOption[] = ((templates ?? []) as unknown as TemplateRow[]).map(t => {
    const seen = new Map<string, TemplateOption['oneRmExercises'][number]>()
    for (const d of t.plan_days) {
      for (const e of d.plan_exercises) {
        if (!e.plan_sets.some(s => s.target_pct_1rm != null)) continue
        const key = e.exercise_master_id ?? e.trainer_exercise_id ?? ''
        if (!seen.has(key)) {
          seen.set(key, {
            exerciseMasterId: e.exercise_master_id,
            trainerExerciseId: e.trainer_exercise_id,
            name: e.exercise_master?.name ?? e.trainer_exercises?.name ?? '',
            targetMuscle: e.exercise_master?.target_muscle ?? e.trainer_exercises?.target_muscle ?? null,
            sortOrder: e.exercise_master?.sort_order ?? Number.MAX_SAFE_INTEGER,
          })
        }
      }
    }
    // 部位別（胸・背中・脚・肩・腕・体幹）に並べ、同じ部位の中は種目マスタの並び順（2026-10-25）
    const muscleRank = (m: string | null) => { const i = MUSCLE_ORDER.indexOf(m as TargetMuscle); return i < 0 ? MUSCLE_ORDER.length : i }
    const oneRmExercises = [...seen.values()].sort((a, b) => muscleRank(a.targetMuscle) - muscleRank(b.targetMuscle) || a.sortOrder - b.sortOrder)
    return { id: t.id, name: t.name, oneRmExercises }
  })

  const selected = rows.find(r => r.linkId === selectedId && !r.isSelf) ?? null

  return (
    <div className="md:flex md:h-screen">
      <section className={`md:w-[420px] md:shrink-0 md:border-r border-zinc-100 dark:border-zinc-900 md:overflow-y-auto ${selected ? 'hidden md:block' : ''}`}>
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black dark:text-white">一覧</h1>
          <AddTraineeButton templates={templateOptions} />
        </div>
        <div className="px-4 py-4 space-y-2">
          {rows.filter(r => r.isSelf).map(r => (
            // 自分の行はトレーニー用の画面へ切り替える（prefetch しない: Cookieを立てるルートのため）
            <Link
              key={r.linkId}
              href="/trainer/self"
              prefetch={false}
              className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <div>
                <p className="text-sm font-semibold text-black dark:text-white">{profile?.display_name ?? r.name}（自分）</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  自分のトレーニングを開く{r.lastTrainedOn ? ` · 最終記録 ${r.lastTrainedOn.slice(5).replace('-', '/')}` : ''}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
            </Link>
          ))}
          {rows.filter(r => !r.isSelf).length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-10">
              「追加」からトレーニーを招待できます。
            </p>
          ) : (
            rows.filter(r => !r.isSelf).map(r => <TraineeListItem key={r.linkId} row={r} selected={r.linkId === selected?.linkId} />)
          )}
        </div>
      </section>

      <section className={`flex-1 md:overflow-y-auto ${selected ? '' : 'hidden md:block'}`}>
        {selected ? (
          <>
            <Link href="/trainer" className="md:hidden flex items-center gap-1 px-4 pt-4 text-sm text-zinc-500">
              <ChevronLeft className="w-4 h-4" />
              一覧
            </Link>
            <TraineeDetailPanel row={selected} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full py-24 text-sm text-zinc-400 dark:text-zinc-500">
            トレーニーを選ぶと、ここに詳細が表示されます
          </div>
        )}
      </section>
    </div>
  )
}
