'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { ExerciseMaster, TargetMuscle } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'

export default function OnboardingPage() {
  const router = useRouter()
  const [masters, setMasters] = useState<ExerciseMaster[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/exercises/master')
      .then(r => r.json())
      .then(d => setMasters(d.exercises ?? []))
  }, [])

  const grouped = masters.reduce<Record<TargetMuscle, ExerciseMaster[]>>((acc, ex) => {
    const muscle = ex.target_muscle as TargetMuscle
    if (!acc[muscle]) acc[muscle] = []
    acc[muscle].push(ex)
    return acc
  }, {} as Record<TargetMuscle, ExerciseMaster[]>)

  const muscleOrder: TargetMuscle[] = ['chest', 'back', 'legs', 'shoulders', 'arms']

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleComplete = async () => {
    if (selected.size === 0) return
    setSaving(true)
    await Promise.all([
      ...Array.from(selected).map((exercise_master_id, i) =>
        fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercise_master_id, sort_order: i }),
        })
      ),
      fetch('/api/stripe/create-subscription', { method: 'POST' }),
    ])
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black pb-24">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">
          あなたが行っている種目を選択してください
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          後から変更できます
        </p>
      </div>

      <div className="px-6 py-6 space-y-8">
        {muscleOrder.map(muscle => {
          const exercises = grouped[muscle]
          if (!exercises?.length) return null
          return (
            <div key={muscle}>
              <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                {TARGET_MUSCLE_LABELS[muscle]}
              </h2>
              <div className="space-y-2">
                {exercises.map(ex => {
                  const isSelected = selected.has(ex.id)
                  return (
                    <button
                      key={ex.id}
                      onClick={() => toggle(ex.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-colors text-left ${
                        isSelected
                          ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                          : 'border-zinc-200 dark:border-zinc-800 text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span className="text-sm font-medium">{ex.name}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed left-0 right-0 p-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={handleComplete}
          disabled={selected.size === 0 || saving}
          className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          {saving ? '登録中...' : `完了 (${selected.size}種目)`}
        </button>
      </div>
    </div>
  )
}
