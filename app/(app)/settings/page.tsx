import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Dumbbell, Mail } from 'lucide-react'
import LogoutButton from './LogoutButton'
import DeleteAccountButton from './DeleteAccountButton'
import AddToHomeScreenSection from '@/components/ui/AddToHomeScreenSection'
import ProgramSection from './ProgramSection'
import { getTrainerProfile } from '@/lib/trainer/session'
import { getTraineeLink } from '@/lib/coaching/trainee'
import TrainerContractSection from './TrainerContractSection'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: enrollment }, trainerProfile, traineeLink] = await Promise.all([
    supabase
      .from('users')
      .select('email')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_program_enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    getTrainerProfile(supabase, user.id),
    getTraineeLink(supabase, user.id),
  ])

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>

      <div className="px-6 py-6 space-y-4">
        {trainerProfile && (
          // トレーナーが「自分のトレーニング」に入っている時だけ表示される（それ以外はトレーナー画面へ戻される）
          <Link
            href="/trainer/exit-self"
            prefetch={false}
            className="flex items-center justify-between px-5 py-4 rounded-2xl bg-black dark:bg-white"
          >
            <span className="text-sm font-semibold text-white dark:text-black">トレーナー画面に戻る</span>
            <ChevronRight className="w-4 h-4 text-white/60 dark:text-black/60" />
          </Link>
        )}

        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">アカウント</h2>
          <p className="text-sm text-black dark:text-white">{userData?.email ?? user.email}</p>
        </div>

        {/* トレーナー自身（自分のトレーニング）はトレーナー側の画面で管理するので出さない */}
        {!trainerProfile && (
          <TrainerContractSection
            link={traineeLink ? { linkId: traineeLink.linkId, trainerName: traineeLink.trainerName, status: traineeLink.status } : null}
          />
        )}

        <ProgramSection enrollmentId={enrollment?.id ?? null} />

        <Link
          href="/exercises"
          className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900"
        >
          <div className="flex items-center gap-3">
            <Dumbbell className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-black dark:text-white">種目を管理する</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
        </Link>

        <Link
          href="/contact"
          className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900"
        >
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-black dark:text-white">お問い合わせ</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
        </Link>

        <AddToHomeScreenSection />

        <LogoutButton />

        <div className="pt-2 space-y-2 text-center">
          <div className="flex items-center justify-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
            <a href="https://auxlog.com/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">
              利用規約
            </a>
            <span>·</span>
            <a href="https://auxlog.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">
              プライバシーポリシー
            </a>
            <span>·</span>
            <a href="https://auxlog.com/tokushoho" target="_blank" rel="noopener noreferrer" className="hover:underline">
              特定商取引法
            </a>
          </div>
        </div>

        <DeleteAccountButton />
      </div>
    </div>
  )
}
