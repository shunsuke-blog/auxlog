'use client'

import { useState } from 'react'
import type { TargetMuscle } from '@/types'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS } from '@/types'
import { useToast } from '@/hooks/useToast'
import Toast from '@/components/ui/Toast'

type Props = { initialMuscles: TargetMuscle[] }

export default function PriorityMusclesSelector({ initialMuscles }: Props) {
  const [muscles, setMuscles] = useState<TargetMuscle[]>(initialMuscles)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  const handleToggle = async (muscle: TargetMuscle) => {
    if (saving) return
    const next = muscles.includes(muscle)
      ? muscles.filter(m => m !== muscle)
      : [...muscles, muscle]
    setMuscles(next)
    setSaving(true)
    const res = await fetch('/api/program/priority-muscles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority_muscles: next }),
    })
    setSaving(false)
    showToast(res.ok ? '保存しました' : '保存に失敗しました')
  }

  return (
    <>
      <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">優先部位</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            選んだ部位はセッション75分・90分でセット数が段階的に増えます（60分では発動しません）。未選択の場合は「胸」が優先されます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_ORDER.map(muscle => {
            const isSelected = muscles.includes(muscle)
            return (
              <button
                key={muscle}
                onClick={() => handleToggle(muscle)}
                disabled={saving}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors disabled:opacity-40 ${
                  isSelected
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {TARGET_MUSCLE_LABELS[muscle]}
              </button>
            )
          })}
        </div>
      </div>
      <Toast message={toast} />
    </>
  )
}
