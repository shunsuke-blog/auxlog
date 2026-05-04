'use client'

import { useState } from 'react'
import type { TrainingLevel } from '@/types'
import { TRAINING_LEVEL_LABELS } from '@/types'
import { useToast } from '@/hooks/useToast'
import Toast from '@/components/ui/Toast'

const OPTIONS: { value: TrainingLevel; sub: string }[] = [
  { value: 'beginner',     sub: '1年未満' },
  { value: 'intermediate', sub: '1〜3年' },
  { value: 'advanced',     sub: '3年以上' },
]

export default function TrainingLevelSelector({ initialLevel }: { initialLevel: TrainingLevel }) {
  const [level, setLevel] = useState<TrainingLevel>(initialLevel)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  const handleChange = async (next: TrainingLevel) => {
    if (next === level || saving) return
    setLevel(next)
    setSaving(true)
    const res = await fetch('/api/users/training-level', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ training_level: next }),
    })
    setSaving(false)
    showToast(res.ok ? '保存しました' : '保存に失敗しました')
  }

  return (
    <>
      <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">トレーニングレベル</h2>
        <div className="flex gap-2">
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              className={`flex-1 py-3 rounded-xl text-center transition-colors ${
                level === opt.value
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <p className="text-xs font-semibold">{TRAINING_LEVEL_LABELS[opt.value]}</p>
              <p className={`text-[10px] mt-0.5 ${level === opt.value ? 'text-white/60 dark:text-black/50' : 'text-zinc-400 dark:text-zinc-500'}`}>
                {opt.sub}
              </p>
            </button>
          ))}
        </div>
      </div>
      <Toast message={toast} />
    </>
  )
}
