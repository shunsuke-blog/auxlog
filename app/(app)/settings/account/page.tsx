import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import LogoutButton from '../LogoutButton'
import DeleteAccountButton from '../DeleteAccountButton'
import ProgramSection from '../ProgramSection'

// アカウント（アプリの設定 > アカウント と同じ構成、2026-10-25）: メールアドレス、プログラムのリセット
// （セルフモードのプログラムがある時だけ）、ログアウト、アカウントの削除。
export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: userData }, { data: enrollment }] = await Promise.all([
    supabase.from('users').select('email').eq('id', user.id).single(),
    supabase.from('user_program_enrollments').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ])

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <div className="flex items-center gap-2">
          <Link href="/settings" aria-label="設定に戻る" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold text-black dark:text-white">アカウント</h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-1">
          <p className="text-xs text-zinc-400">メールアドレス</p>
          <p className="text-sm text-black dark:text-white">{userData?.email ?? user.email}</p>
        </div>

        <ProgramSection enrollmentId={enrollment?.id ?? null} />

        <LogoutButton />

        <DeleteAccountButton />
      </div>
    </div>
  )
}
