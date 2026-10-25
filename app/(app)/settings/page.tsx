import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Dumbbell, Mail, UserCircle } from 'lucide-react'
import AddToHomeScreenSection from '@/components/ui/AddToHomeScreenSection'
import { getTrainerProfile } from '@/lib/trainer/session'
import { getTraineeLink } from '@/lib/coaching/trainee'
import TrainerContractSection from './TrainerContractSection'

const POLICY_LINKS = [
  { label: '利用規約', href: 'https://auxlog.com/terms' },
  { label: 'プライバシーポリシー', href: 'https://auxlog.com/privacy' },
  { label: '特定商取引法', href: 'https://auxlog.com/tokushoho' },
]

function Row({ href, icon: Icon, label }: { href: string; icon: typeof Mail; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-black dark:text-white">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
    </Link>
  )
}

// 設定（アプリの設定画面に合わせる、2026-10-25）: アカウント（メール・プログラムのリセット・ログアウト・
// 削除は1つ下の画面）、お問い合わせ、規約のリンク。Web版だけの項目として、担当トレーナー・種目の管理・
// ホーム画面に追加 を置く。トレーナーのプランを使っている間は、種目はトレーナーが管理するので「種目を管理する」は出さない。
export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [trainerProfile, traineeLink] = await Promise.all([
    getTrainerProfile(supabase, user.id),
    getTraineeLink(supabase, user.id),
  ])

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">設定</h1>
      </div>

      <div className="px-6 py-6 space-y-3">
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

        {/* トレーナー自身（自分のトレーニング）はトレーナー側の画面で管理するので出さない */}
        {!trainerProfile && (
          <TrainerContractSection
            link={traineeLink ? { linkId: traineeLink.linkId, trainerName: traineeLink.trainerName, status: traineeLink.status } : null}
          />
        )}

        <Row href="/settings/account" icon={UserCircle} label="アカウント" />
        {!traineeLink && <Row href="/exercises" icon={Dumbbell} label="種目を管理する" />}
        <Row href="/contact" icon={Mail} label="お問い合わせ" />

        <AddToHomeScreenSection />

        <div className="pt-4 flex items-center justify-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
          {POLICY_LINKS.map((l, i) => (
            <span key={l.href} className="flex items-center gap-3">
              {i > 0 && <span>·</span>}
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:underline">{l.label}</a>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
