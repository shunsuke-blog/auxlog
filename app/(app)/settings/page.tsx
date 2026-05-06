import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Dumbbell, Mail } from 'lucide-react'
import LogoutButton from './LogoutButton'
import TrainingLevelSelector from './TrainingLevelSelector'
import AddToHomeScreenSection from '@/components/ui/AddToHomeScreenSection'
import type { TrainingLevel } from '@/types'

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    trialing: 'トライアル中',
    active: '有効',
    canceling: '解約予定',
    canceled: 'キャンセル済み',
    past_due: '支払い遅延',
  }
  return labels[status] ?? status
}

function getTrialDaysLeft(trialEndsAt: string): number {
  const now = new Date()
  const end = new Date(trialEndsAt)
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('email, subscription_status, trial_ends_at, is_admin, is_free, free_until, training_level')
    .eq('id', user.id)
    .single()

  const isAdmin = userData?.is_admin ?? false
  const isFree = userData?.is_free ?? false
  const freeUntil = userData?.free_until ?? null
  const freeActive = isFree && (!freeUntil || new Date(freeUntil) > new Date())
  const trainingLevel: TrainingLevel = (userData?.training_level as TrainingLevel) ?? 'intermediate'
  const status = isAdmin ? 'active' : (userData?.subscription_status ?? null)
  const trialEndsAt = userData?.trial_ends_at ?? ''
  const daysLeft = (status === 'trialing' || status === 'canceling') && trialEndsAt
    ? getTrialDaysLeft(trialEndsAt)
    : null

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>

      <div className="px-6 py-6 space-y-4">
        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">アカウント</h2>
          <p className="text-sm text-black dark:text-white">{userData?.email ?? user.email}</p>
        </div>

        <Link
          href="/settings/subscription"
          className="block px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3"
        >
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">サブスクリプション</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-black dark:text-white">ステータス</span>
            <span className={`text-sm font-medium ${
              isAdmin || freeActive ? 'text-emerald-500' :
              status === 'active' ? 'text-emerald-500' :
              status === 'trialing' ? 'text-accent' :
              status === 'canceling' ? 'text-accent' :
              status === null ? 'text-zinc-400' :
              'text-red-500'
            }`}>
              {isAdmin ? '有効（管理者）' : freeActive ? `無料${freeUntil ? '（期限付き）' : ''}` : status === null ? '未開始' : getStatusLabel(status)}
            </span>
          </div>
          {freeActive && freeUntil && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">無料期限</span>
              <span className="text-sm text-black dark:text-white">
                {new Date(freeUntil).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
              </span>
            </div>
          )}
          {!isAdmin && !freeActive && daysLeft !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {status === 'canceling' ? 'サービス終了まで' : 'トライアル残り'}
              </span>
              <span className="text-sm text-black dark:text-white">{daysLeft}日</span>
            </div>
          )}
          {!isAdmin && !freeActive && status !== 'trialing' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">料金</span>
              <span className="text-sm text-black dark:text-white">¥480/月</span>
            </div>
          )}
        </Link>
        
        <TrainingLevelSelector initialLevel={trainingLevel} />

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
      </div>
    </div>
  )
}
