import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import LogoutButton from '@/app/(app)/settings/LogoutButton'

// トレーナーの設定。中身はこれから詰める（今はアカウントとログアウトだけ）。
export default async function TrainerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? await getTrainerProfile(supabase, user.id) : null

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>
      <div className="px-6 py-6 space-y-4 max-w-xl">
        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">アカウント</h2>
          <p className="text-sm text-black dark:text-white">{profile?.display_name}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{user?.email}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  )
}
