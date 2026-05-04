'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResumeButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleResume = async () => {
    setLoading(true)
    const res = await fetch('/api/stripe/resume-subscription', { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error ?? 'エラーが発生しました')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleResume}
      disabled={loading}
      className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
    >
      {loading ? '処理中...' : '解約を取り消す'}
    </button>
  )
}
