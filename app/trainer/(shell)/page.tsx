import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'

// トレーニー一覧。中身（トレーニーの追加・状態・詳細・契約終了）はこれから詰める。
// 一番上に自分自身がいて、ここから自分のトレーニング（トレーニー用の画面）に入る（2026-10-19 決定）。
export default async function TrainerTraineesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? await getTrainerProfile(supabase, user.id) : null

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5">
        <h1 className="text-xl font-semibold text-black dark:text-white">一覧</h1>
      </div>
      <div className="px-6 py-6 space-y-4 max-w-3xl">
        {/* prefetch しない: /trainer/self はCookieを立てるルートなので、表示しただけで切り替わってはいけない */}
        <Link
          href="/trainer/self"
          prefetch={false}
          className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-black dark:text-white">{profile?.display_name ?? '自分'}（自分）</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">自分のトレーニングを開く</p>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
        </Link>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">トレーニーの管理は準備中です。</p>
      </div>
    </div>
  )
}
