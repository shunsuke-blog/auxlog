'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

export default function LogoutButton() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        ログアウト
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-black dark:text-white">ログアウト</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">ログアウトしてもよいですか？</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400"
              >
                キャンセル
              </button>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40"
              >
                {loading ? '処理中...' : 'ログアウト'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
