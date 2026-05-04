'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import Toast from '@/components/ui/Toast'

type Category = 'bug' | 'feature' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: '不具合報告' },
  { value: 'feature', label: '機能要望' },
  { value: 'other', label: 'その他' },
]

export default function ContactPage() {
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [category, setCategory] = useState<Category>('bug')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      showToast('件名と本文を入力してください')
      return
    }
    setSending(true)
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subject: subject.trim(), body: body.trim() }),
    })
    if (res.ok) {
      showToast('送信しました')
      setTimeout(() => router.push('/settings'), 1200)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '送信に失敗しました')
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 py-5 z-10 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          className="p-1.5 -ml-1.5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-black dark:text-white">お問い合わせ</h1>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* カテゴリ */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">カテゴリ</label>
          <div className="flex gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  category === c.value
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 件名 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">件名</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={200}
            placeholder="件名を入力"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
        </div>

        {/* 本文 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">本文</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={5000}
            rows={8}
            placeholder="お問い合わせ内容を入力してください"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white text-sm resize-none outline-none focus:border-black dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
          />
          <p className="text-right text-xs text-zinc-400">{body.length}/5000</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={sending}
          className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {sending ? '送信中...' : '送信する'}
        </button>
      </div>

      <Toast message={toast} />
    </div>
  )
}
