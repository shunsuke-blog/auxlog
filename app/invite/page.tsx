import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTraineeLink } from '@/lib/coaching/trainee'

// トレーナーからの招待の受け取り方の案内（2026-10-28 招待コードの入力をやめ、ログイン用リンクに変えた）。
// オンボーディングと設定から入る。リンク（/join/<token>）をこの端末で開くと「このアカウントで受け取る」が出る
export default async function InvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/invite')

  const link = await getTraineeLink(supabase, user.id)
  const currentTrainerName = link && !link.isSelf ? link.trainerName : null

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <Link href="/" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-black dark:hover:text-white -ml-1 mb-1">
          <ChevronLeft className="w-4 h-4" />
          戻る
        </Link>
        <h1 className="text-xl font-semibold text-black dark:text-white">トレーナーからの招待</h1>
      </div>

      <div className="px-6 py-8 max-w-md space-y-4">
        {currentTrainerName ? (
          <div className="px-5 py-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 space-y-1">
            <p className="text-sm font-semibold text-black dark:text-white">{currentTrainerName} さんと契約中です</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">新しいトレーナーのプランを受け取るには、設定から今の契約を終了してください。</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <p>トレーナーから LINE などで届いたリンクを、この端末でそのまま開いてください。</p>
            <p>今ログインしているアカウントのまま「このアカウントで受け取る」を押すと、トレーナーが作ったプランで記録できるようになります。今のプログラムは終了しますが、これまでの記録はそのまま残ります。</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">リンクが届いていない場合は、トレーナーに「招待リンク」を送ってもらってください。</p>
          </div>
        )}
      </div>
    </div>
  )
}
