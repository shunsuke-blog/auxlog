import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import { loadTraineeRows } from '@/lib/trainer/trainees'
import TraineeListItem from './TraineeListItem'
import TraineeDetailPanel from './TraineeDetailPanel'
import AddTraineeButton, { type TemplateOption } from './AddTraineeButton'

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
      .select('id, name')
      .is('link_id', null)
      .order('updated_at', { ascending: false }),
  ])

  const templateOptions: TemplateOption[] = (templates ?? []).map(t => ({ id: t.id as string, name: t.name as string }))

  const selected = rows.find(r => r.linkId === selectedId && !r.isSelf) ?? null

  return (
    // 見出しの帯は一覧と詳細の両方の上に、右端まで伸ばす（2026-10-25 オーナー指摘）。PC は帯の下を一覧と詳細の2列にし、
    // それぞれをスクロールさせる。スマホで詳細を開いている時は帯を出さない（詳細に「一覧」へ戻るリンクがある）
    <div className="md:h-screen md:flex md:flex-col">
      <div className={`sticky top-0 z-10 shrink-0 trainer-header h-14 md:h-[72px] px-4 md:px-6 items-center justify-between ${selected ? 'hidden md:flex' : 'flex'}`}>
        <h1 className="text-xl font-semibold text-black dark:text-white">契約者一覧</h1>
        <AddTraineeButton templates={templateOptions} />
      </div>
      <div className="md:flex md:flex-1 md:min-h-0">
      <section className={`md:w-[420px] md:shrink-0 md:border-r border-zinc-100 dark:border-zinc-900 md:overflow-y-auto ${selected ? 'hidden md:block' : ''}`}>
        <div className="px-4 py-4 space-y-2">
          {rows.filter(r => r.isSelf).map(r => (
            // 自分の行はトレーニー用の画面へ切り替える（prefetch しない: Cookieを立てるルートのため）
            <Link
              key={r.linkId}
              href="/trainer/self"
              prefetch={false}
              className="flex items-center justify-between px-4 py-3.5 rounded-2xl trainer-card hover:bg-zinc-50 dark:hover:bg-zinc-950"
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
              「追加」から契約者を招待できます。
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
            契約者を選ぶと、ここに詳細が表示されます
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
