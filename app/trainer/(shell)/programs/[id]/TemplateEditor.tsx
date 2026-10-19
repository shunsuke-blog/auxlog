'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2, X } from 'lucide-react'
import { TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import ExercisePicker from './ExercisePicker'
import {
  newKey, toSavePayload,
  type CatalogExercise, type EditorExercise, type EditorSet, type WeightMode,
} from '@/lib/trainer/templateEditor'

export type EditorDay = { id: string; weekNumber: number; dayNumber: number; exercises: EditorExercise[] }

type Props = { planId: string; initialName: string; totalWeeks: number; days: EditorDay[]; catalog: CatalogExercise[] }

const MODE_LABELS: Record<WeightMode, string> = { pct: '%1RM', kg: 'kg', auto: '自動' }
const blankSet = (): EditorSet => ({ mode: 'auto', value: '', reps: '10', rir: '2', isWarmup: false })

// テンプレートの編集。週 → Day を選び、その日の種目とセットを編集して Day ごとに保存する。
// 重量は %1RM（トレーニー追加時に1RMから kg を計算）・kg（固定）・自動（前回記録から提案、
// アイソレーション向け）のどれかで指定する（2026-10-19 決定）。
export default function TemplateEditor({ planId, initialName, totalWeeks, days, catalog: initialCatalog }: Props) {
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  // 最後に保存した内容（変更を破棄するときの戻り先）と、編集中の内容
  const [savedByDay, setSavedByDay] = useState<Record<string, EditorExercise[]>>(() => Object.fromEntries(days.map(d => [d.id, d.exercises])))
  const [byDay, setByDay] = useState<Record<string, EditorExercise[]>>(savedByDay)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [week, setWeek] = useState(1)
  const daysOfWeek = days.filter(d => d.weekNumber === week)
  const [dayId, setDayId] = useState(days.find(d => d.weekNumber === 1)?.id ?? days[0]?.id ?? '')
  const [catalog, setCatalog] = useState(initialCatalog)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const current = days.find(d => d.id === dayId)
  const exercises = byDay[dayId] ?? []
  const isDirty = dirty.has(dayId)

  // 未保存の変更がある Day から移動するときは確認し、移動するなら変更を破棄する
  const leaveCurrentDay = (): boolean => {
    if (!isDirty) return true
    if (!window.confirm('このDayの変更が保存されていません。破棄して移動しますか？')) return false
    setByDay(prev => ({ ...prev, [dayId]: savedByDay[dayId] ?? [] }))
    setDirty(prev => { const n = new Set(prev); n.delete(dayId); return n })
    return true
  }

  const selectDay = (id: string) => {
    if (id === dayId || !leaveCurrentDay()) return
    setMessage(null)
    setDayId(id)
  }

  const selectWeek = (w: number) => {
    // 週を変えても同じ Day 番号を開く（無ければその週の最初の Day）
    const target = days.find(d => d.weekNumber === w && d.dayNumber === current?.dayNumber) ?? days.find(d => d.weekNumber === w)
    if (!target || (target.id !== dayId && !leaveCurrentDay())) return
    setWeek(w)
    setMessage(null)
    setDayId(target.id)
  }

  const update = (fn: (list: EditorExercise[]) => EditorExercise[]) => {
    setByDay(prev => ({ ...prev, [dayId]: fn(prev[dayId] ?? []) }))
    setDirty(prev => new Set(prev).add(dayId))
    setMessage(null)
  }

  const updateExercise = (key: string, patch: Partial<EditorExercise>) =>
    update(list => list.map(e => (e.key === key ? { ...e, ...patch } : e)))

  const updateSet = (key: string, idx: number, patch: Partial<EditorSet>) =>
    update(list => list.map(e => (e.key === key ? { ...e, sets: e.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) } : e)))

  const move = (key: string, dir: -1 | 1) =>
    update(list => {
      const i = list.findIndex(e => e.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const addExercise = (ex: CatalogExercise) => {
    update(list => [...list, { key: newKey(), ...ex, note: '', sets: [blankSet(), blankSet(), blankSet()] }])
    setPicking(false)
  }

  const saveDay = async () => {
    const payload = toSavePayload(exercises)
    if (!payload.ok) {
      setMessage({ kind: 'error', text: payload.error })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/trainer/template-days/${dayId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: payload.exercises }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '保存に失敗しました')
      }
      setSavedByDay(prev => ({ ...prev, [dayId]: exercises }))
      setDirty(prev => { const n = new Set(prev); n.delete(dayId); return n })
      setMessage({ kind: 'ok', text: '保存しました' })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedName) { setName(savedName); return }
    const res = await fetch(`/api/trainer/templates/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null)
    if (res?.ok) setSavedName(trimmed)
    else setName(savedName)
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link href="/trainer/programs" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={saveName}
            maxLength={60}
            className="flex-1 min-w-0 text-lg font-semibold bg-transparent text-black dark:text-white focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              onClick={() => selectWeek(w)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${w === week ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`}
            >
              Week {w}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {daysOfWeek.map(d => (
            <button
              key={d.id}
              onClick={() => selectDay(d.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${d.id === dayId ? 'border-black dark:border-white text-black dark:text-white' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}
            >
              Day {d.dayNumber}{dirty.has(d.id) ? ' ●' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 space-y-4 max-w-4xl">
        {exercises.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">この日の種目はまだありません。</p>
        )}

        {exercises.map((ex, exIdx) => (
          <div key={ex.key} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-400">{ex.targetMuscle ? TARGET_MUSCLE_LABELS[ex.targetMuscle as TargetMuscle] ?? ex.targetMuscle : ''}</p>
                <p className="text-sm font-semibold text-black dark:text-white">{ex.name}</p>
              </div>
              <button onClick={() => move(ex.key, -1)} disabled={exIdx === 0} title="上へ" className="p-1.5 text-zinc-400 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button onClick={() => move(ex.key, 1)} disabled={exIdx === exercises.length - 1} title="下へ" className="p-1.5 text-zinc-400 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button onClick={() => update(list => list.filter(e => e.key !== ex.key))} title="種目を外す" className="p-1.5 text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>

            <input
              value={ex.note}
              onChange={e => updateExercise(ex.key, { note: e.target.value })}
              maxLength={200}
              placeholder="トレーナーからのコメント（任意）"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-zinc-400 text-left">
                    <th className="font-medium py-1 pr-2 w-10">セット</th>
                    <th className="font-medium py-1 pr-2">W-UP</th>
                    <th className="font-medium py-1 pr-2">重量</th>
                    <th className="font-medium py-1 pr-2 w-20">回数</th>
                    <th className="font-medium py-1 pr-2 w-16">RIR</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((s, i) => (
                    <tr key={i} className="align-middle">
                      <td className="py-1 pr-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="py-1 pr-2">
                        <input type="checkbox" checked={s.isWarmup} onChange={e => updateSet(ex.key, i, { isWarmup: e.target.checked })} />
                      </td>
                      <td className="py-1 pr-2">
                        <div className="flex items-center gap-1">
                          <select
                            value={s.mode}
                            onChange={e => updateSet(ex.key, i, { mode: e.target.value as WeightMode, value: '' })}
                            className="px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-black dark:text-white"
                          >
                            {(Object.keys(MODE_LABELS) as WeightMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                          </select>
                          {s.mode !== 'auto' && (
                            <input
                              inputMode="decimal"
                              value={s.value}
                              onChange={e => updateSet(ex.key, i, { value: e.target.value })}
                              placeholder={s.mode === 'pct' ? '75' : '60'}
                              className="w-16 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-1 pr-2">
                        <input inputMode="numeric" value={s.reps} onChange={e => updateSet(ex.key, i, { reps: e.target.value })} className="w-16 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white" />
                      </td>
                      <td className="py-1 pr-2">
                        <input inputMode="numeric" value={s.rir} onChange={e => updateSet(ex.key, i, { rir: e.target.value })} placeholder="-" className="w-12 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white" />
                      </td>
                      <td className="py-1">
                        <button onClick={() => updateExercise(ex.key, { sets: ex.sets.filter((_, j) => j !== i) })} disabled={ex.sets.length <= 1} title="セットを削除" className="p-1 text-zinc-300 hover:text-red-500 disabled:opacity-30">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => updateExercise(ex.key, { sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? blankSet()) }] })}
              disabled={ex.sets.length >= 20}
              className="text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30"
            >
              + セットを追加
            </button>
          </div>
        ))}

        <button
          onClick={() => setPicking(true)}
          disabled={exercises.length >= 30}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
        >
          <Plus className="w-4 h-4" />
          種目を追加
        </button>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
          重量の「%1RM」はトレーニーを追加するときに入力する1RMから kg を計算します。「自動」は前回の記録から重量を提案します（アイソレーション種目向け）。
        </p>
      </div>

      <div className="sticky bottom-16 md:bottom-0 z-10 px-6 py-3 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900 flex items-center gap-3">
        <p className={`flex-1 text-sm ${message?.kind === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {message?.text ?? (isDirty ? `Week ${week} / Day ${current?.dayNumber} に未保存の変更があります` : '')}
        </p>
        <button onClick={saveDay} disabled={!isDirty || saving} className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-40">
          {saving ? '保存中...' : 'このDayを保存'}
        </button>
      </div>

      {picking && (
        <ExercisePicker
          catalog={catalog}
          onPick={addExercise}
          onCreated={ex => { setCatalog(prev => [ex, ...prev]); addExercise(ex) }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
