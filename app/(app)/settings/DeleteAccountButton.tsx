'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

export default function DeleteAccountButton() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/account/delete', { method: 'DELETE' })
    if (!res.ok) {
      setLoading(false)
      setError('削除に失敗しました。もう一度お試しください。')
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-red-200 dark:border-red-900/40 text-red-500 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        アカウントを削除する
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-black dark:text-white">アカウントを削除</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                トレーニング記録・プログラム進捗・サブスクリプションを含む全てのデータが完全に削除されます。この操作は取り消せません。
              </p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40"
              >
                {loading ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
