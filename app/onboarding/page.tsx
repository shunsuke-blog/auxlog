'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { ExerciseMaster, TargetMuscle, TrainingLevel } from '@/types'
import { TARGET_MUSCLE_LABELS, TRAINING_LEVEL_LABELS } from '@/types'

type Step = 'level' | 'exercises'

type LevelOption = {
  value: TrainingLevel
  subtext: string
  weeklyTarget: string
}

const LEVEL_OPTIONS: LevelOption[] = [
  { value: 'beginner',     subtext: 'トレーニング歴1年未満',  weeklyTarget: '週目標: 8〜12セット / 筋群' },
  { value: 'intermediate', subtext: 'トレーニング歴1〜3年',   weeklyTarget: '週目標: 12〜16セット / 筋群' },
  { value: 'advanced',     subtext: 'トレーニング歴3年以上',  weeklyTarget: '週目標: 16〜20セット / 筋群' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('level')
  const [selectedLevel, setSelectedLevel] = useState<TrainingLevel>('intermediate')
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

  const handleLevelNext = async () => {
    await fetch('/api/users/training-level', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ training_level: selectedLevel }),
    })
    setStep('exercises')
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

  if (step === 'level') {
    return (
      <div className="min-h-screen bg-white dark:bg-black pb-32">
        <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mb-1">ステップ 1 / 2</p>
          <h1 className="text-xl font-semibold text-black dark:text-white">
            あなたのトレーニング歴は？
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            後から設定画面で変更できます
          </p>
        </div>

        <div className="px-6 py-8 space-y-4">
          {LEVEL_OPTIONS.map(opt => {
            const isSelected = selectedLevel === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedLevel(opt.value)}
                className={`w-full text-left px-5 py-5 rounded-2xl border-2 transition-colors ${
                  isSelected
                    ? 'border-black dark:border-white bg-black dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-base font-semibold ${isSelected ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                    {TRAINING_LEVEL_LABELS[opt.value]}
                  </span>
                  {isSelected && (
                    <Check className="w-5 h-5 text-white dark:text-black" />
                  )}
                </div>
                <p className={`mt-1 text-sm ${isSelected ? 'text-white/70 dark:text-black/60' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {opt.subtext}
                </p>
                <p className={`mt-2 text-xs font-medium ${isSelected ? 'text-white/60 dark:text-black/50' : 'text-zinc-400 dark:text-zinc-500'}`}>
                  {opt.weeklyTarget}
                </p>
              </button>
            )
          })}
        </div>

        <div
          className="fixed left-0 right-0 p-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
          style={{ bottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            onClick={handleLevelNext}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
          >
            次へ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black pb-24">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mb-1">ステップ 2 / 2</p>
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

      <div
        className="fixed left-0 right-0 p-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}
      >
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
