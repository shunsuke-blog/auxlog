'use client'

import { useState } from 'react'
import { TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import type { OneRmExercise } from '@/lib/trainer/templateOneRm'
import { toDecimalInput } from '@/lib/utils/number_input'

export type TemplateOption = { id: string; name: string }

export type OneRmPayload = { exercise_master_id: string | null; trainer_exercise_id: string | null; one_rm_kg: number }[]

const keyOf = (e: OneRmExercise) => e.exerciseMasterId ?? e.trainerExerciseId ?? ''

// テンプレートの選択と、その %1RM の種目の1RM入力（クライアントの追加と、自分へのプログラムの割り当てで共通）。
// テンプレートを選んだ時に %1RM の種目を読み、入力した1RMから kg を計算する（未入力なら初回の記録から推定）。
export function useTemplateOneRms() {
  const [templateId, setTemplateId] = useState('')
  const [exercises, setExercises] = useState<OneRmExercise[]>([])
  const [loading, setLoading] = useState(false)
  const [oneRms, setOneRms] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectTemplate = async (id: string) => {
    setTemplateId(id)
    setOneRms({})
    setExercises([])
    setLoadError(null)
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/trainer/templates/${id}/one-rm-exercises`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setExercises((data as { exercises: OneRmExercise[] }).exercises)
      else setLoadError('1RMを入力する種目を読み込めませんでした')
    } finally {
      setLoading(false)
    }
  }

  /** 入力した1RMを送る形にする。正しくない値があればその種目名のエラーを返す */
  const buildPayload = (): { payload: OneRmPayload } | { error: string } => {
    const payload: OneRmPayload = []
    for (const ex of exercises) {
      const raw = oneRms[keyOf(ex)]?.trim()
      if (!raw) continue
      const kg = parseFloat(raw)
      if (!Number.isFinite(kg) || kg <= 0 || kg > 500) return { error: `${ex.name} の1RMを正しく入力してください` }
      payload.push({ exercise_master_id: ex.exerciseMasterId, trainer_exercise_id: ex.trainerExerciseId, one_rm_kg: kg })
    }
    return { payload }
  }

  const reset = () => {
    setTemplateId('')
    setOneRms({})
    setExercises([])
    setLoadError(null)
  }

  return { templateId, selectTemplate, exercises, loading, oneRms, setOneRms, loadError, buildPayload, reset }
}

type State = ReturnType<typeof useTemplateOneRms>

export function TemplateOneRmFields({ templates, state, label, who }: { templates: TemplateOption[]; state: State; label: string; who: string }) {
  const { templateId, selectTemplate, exercises, loading, oneRms, setOneRms } = state
  return (
    <>
      <label className="block text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <span>{label}</span>
        <select
          required
          value={templateId}
          onChange={e => selectTemplate(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white"
        >
          <option value="" disabled>選択してください</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      {loading && <p className="text-xs text-zinc-500">1RMを入力する種目を読み込み中…</p>}
      {templateId && !loading && exercises.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            1RM（任意）: 入力すると %1RM のセットに重量が入ります。空欄の種目は、{who}の初回の記録から1RMを推定して、次回から重量を自動で入れます。
          </p>
          {exercises.map(ex => (
            <label key={keyOf(ex)} className="flex items-center gap-2 text-sm text-black dark:text-white">
              <span className="w-8 shrink-0 text-xs text-zinc-400">{ex.targetMuscle ? TARGET_MUSCLE_LABELS[ex.targetMuscle as TargetMuscle] ?? '' : ''}</span>
              <span className="flex-1 truncate">{ex.name}</span>
              <input
                inputMode="decimal"
                value={oneRms[keyOf(ex)] ?? ''}
                onChange={e => setOneRms(prev => ({ ...prev, [keyOf(ex)]: toDecimalInput(e.target.value) }))}
                placeholder="100"
                className="w-20 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums"
              />
              <span className="text-xs text-zinc-400">kg</span>
            </label>
          ))}
        </div>
      )}
    </>
  )
}
