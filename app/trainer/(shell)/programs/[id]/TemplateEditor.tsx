'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronLeft, Copy, Plus, Trash2, X } from 'lucide-react'
import { TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import ExercisePicker from './ExercisePicker'
import {
  newKey, toSavePayload,
  type CatalogExercise, type EditorExercise, type EditorSet, type WeightMode,
} from '@/lib/trainer/templateEditor'

export type EditorDay = { id: string; weekNumber: number; dayNumber: number; exercises: EditorExercise[] }

type Props = { planId: string; initialName: string; totalWeeks: number; days: EditorDay[]; catalog: CatalogExercise[] }
type View = 'day' | 'exercise'
// 未保存の変更があるまま移動しようとした時の確認（保存する／保存しない／キャンセル）
type PendingLeave = { saveIds: string[]; proceed: () => void }

const MODE_LABELS: Record<WeightMode, string> = { pct: '%1RM', kg: 'kg', auto: '自動' }
const blankSet = (): EditorSet => ({ mode: 'auto', value: '', reps: '10', rir: '2', isWarmup: false })
const exerciseId = (ex: Pick<EditorExercise, 'exerciseMasterId' | 'trainerExerciseId'>) =>
  ex.exerciseMasterId ? `m:${ex.exerciseMasterId}` : `t:${ex.trainerExerciseId}`
const muscleLabel = (m: string | null) => (m ? TARGET_MUSCLE_LABELS[m as TargetMuscle] ?? m : '')

const inputClass = 'px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white'

function SetTable({ sets, onChange, onRemove, onAdd }: {
  sets: EditorSet[]
  onChange: (idx: number, patch: Partial<EditorSet>) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}) {
  return (
    <>
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
            {sets.map((s, i) => (
              <tr key={i} className="align-middle">
                <td className="py-1 pr-2 text-zinc-500 tabular-nums">{i + 1}</td>
                <td className="py-1 pr-2">
                  <input type="checkbox" checked={s.isWarmup} onChange={e => onChange(i, { isWarmup: e.target.checked })} />
                </td>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1">
                    <select value={s.mode} onChange={e => onChange(i, { mode: e.target.value as WeightMode, value: '' })} className={`${inputClass} text-xs`}>
                      {(Object.keys(MODE_LABELS) as WeightMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                    </select>
                    {s.mode !== 'auto' && (
                      <input inputMode="decimal" value={s.value} onChange={e => onChange(i, { value: e.target.value })} placeholder={s.mode === 'pct' ? '75' : '60'} className={`${inputClass} w-16`} />
                    )}
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" value={s.reps} onChange={e => onChange(i, { reps: e.target.value })} className={`${inputClass} w-16`} />
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" value={s.rir} onChange={e => onChange(i, { rir: e.target.value })} placeholder="-" className={`${inputClass} w-12`} />
                </td>
                <td className="py-1">
                  <button onClick={() => onRemove(i)} disabled={sets.length <= 1} title="セットを削除" className="p-1 text-zinc-300 hover:text-red-500 disabled:opacity-30">
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} disabled={sets.length >= 20} className="text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30">
        + セットを追加
      </button>
    </>
  )
}

// テンプレートの編集。表示は「Day ごと」（週 → Day を選んでその日の種目を編集）と「種目ごと」
// （種目を選んで、その種目が出てくる全週・全Dayのセットを並べて編集）を切り替えられる（2026-10-19 オーナー依頼）。
// 重量は %1RM（トレーニー追加時に1RMから kg を計算）・kg（固定）・自動（前回記録から提案）のどれか。
export default function TemplateEditor({ planId, initialName, totalWeeks, days, catalog: initialCatalog }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  // 最後に保存した内容（「保存しない」を選んだときの戻り先）と、編集中の内容
  const [savedByDay, setSavedByDay] = useState<Record<string, EditorExercise[]>>(() => Object.fromEntries(days.map(d => [d.id, d.exercises])))
  const [byDay, setByDay] = useState<Record<string, EditorExercise[]>>(savedByDay)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>('day')
  const [week, setWeek] = useState(1)
  const [dayId, setDayId] = useState(days.find(d => d.weekNumber === 1)?.id ?? days[0]?.id ?? '')
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<PendingLeave | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const sortedDays = [...days].sort((a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber)
  const daysOfWeek = sortedDays.filter(d => d.weekNumber === week)
  const current = days.find(d => d.id === dayId)
  const exercises = byDay[dayId] ?? []
  const label = (id: string) => {
    const d = days.find(x => x.id === id)
    return d ? `Week ${d.weekNumber} / Day ${d.dayNumber}` : ''
  }

  // テンプレートに出てくる種目（種目ごと表示の選択肢）。最初に出てくる順。
  const exerciseOptions: { id: string; name: string; targetMuscle: string | null }[] = []
  for (const d of sortedDays) {
    for (const ex of byDay[d.id] ?? []) {
      const id = exerciseId(ex)
      if (!exerciseOptions.some(o => o.id === id)) exerciseOptions.push({ id, name: ex.name, targetMuscle: ex.targetMuscle })
    }
  }
  const activeExercise = exerciseOptions.find(o => o.id === selectedExercise) ?? exerciseOptions[0] ?? null

  const updateDay = (id: string, fn: (list: EditorExercise[]) => EditorExercise[]) => {
    setByDay(prev => ({ ...prev, [id]: fn(prev[id] ?? []) }))
    setDirty(prev => new Set(prev).add(id))
    setMessage(null)
  }
  const patchExercise = (id: string, key: string, fn: (ex: EditorExercise) => EditorExercise) =>
    updateDay(id, list => list.map(e => (e.key === key ? fn(e) : e)))
  const patchSet = (id: string, key: string, idx: number, patch: Partial<EditorSet>) =>
    patchExercise(id, key, e => ({ ...e, sets: e.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }))

  // 指定した Day を保存する。1件でも入力エラー・保存失敗があれば false
  const saveDays = async (ids: string[]): Promise<boolean> => {
    for (const id of ids) {
      const payload = toSavePayload(byDay[id] ?? [])
      if (!payload.ok) {
        setMessage({ kind: 'error', text: `${label(id)}: ${payload.error}` })
        return false
      }
    }
    setSaving(true)
    setMessage(null)
    try {
      for (const id of ids) {
        const payload = toSavePayload(byDay[id] ?? [])
        if (!payload.ok) continue
        const res = await fetch(`/api/trainer/template-days/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercises: payload.exercises }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(`${label(id)}: ${(data as { error?: string }).error ?? '保存に失敗しました'}`)
        }
        setSavedByDay(prev => ({ ...prev, [id]: byDay[id] ?? [] }))
        setDirty(prev => { const n = new Set(prev); n.delete(id); return n })
      }
      setMessage({ kind: 'ok', text: '保存しました' })
      return true
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : '保存に失敗しました' })
      return false
    } finally {
      setSaving(false)
    }
  }

  const discardDays = (ids: string[]) => {
    setByDay(prev => ({ ...prev, ...Object.fromEntries(ids.map(id => [id, savedByDay[id] ?? []])) }))
    setDirty(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
  }

  // Day ごと表示で、未保存の Day から別の Day・週へ移るときは「保存しますか？」を確認する
  const leaveDay = (proceed: () => void) => {
    if (!dirty.has(dayId)) {
      setMessage(null)
      proceed()
      return
    }
    setPending({ saveIds: [dayId], proceed })
  }

  const selectDay = (id: string) => {
    if (id !== dayId) leaveDay(() => setDayId(id))
  }

  const selectWeek = (w: number) => {
    // 週を変えても同じ Day 番号を開く（無ければその週の最初の Day）
    const target = days.find(d => d.weekNumber === w && d.dayNumber === current?.dayNumber) ?? days.find(d => d.weekNumber === w)
    if (target && target.id !== dayId) leaveDay(() => { setWeek(w); setDayId(target.id) })
  }

  const goBack = (e: React.MouseEvent) => {
    if (dirty.size === 0) return
    e.preventDefault()
    setPending({ saveIds: [...dirty], proceed: () => router.push('/trainer/programs') })
  }

  const resolvePending = async (choice: 'save' | 'discard' | 'cancel') => {
    if (!pending) return
    if (choice === 'cancel') { setPending(null); return }
    if (choice === 'save') {
      const ok = await saveDays(pending.saveIds)
      if (!ok) { setPending(null); return }
    } else {
      discardDays(pending.saveIds)
    }
    const { proceed } = pending
    setPending(null)
    proceed()
  }

  const move = (key: string, dir: -1 | 1) =>
    updateDay(dayId, list => {
      const i = list.findIndex(e => e.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const addExercise = (ex: CatalogExercise) => {
    updateDay(dayId, list => [...list, { key: newKey(), ...ex, note: '', sets: [blankSet(), blankSet(), blankSet()] }])
    setPicking(false)
  }

  // Week 2 以降で、Week 1 の同じ Day の種目・セットを今の Day にコピーする（未保存の状態になる）。
  const week1SameDay = days.find(d => d.weekNumber === 1 && d.dayNumber === current?.dayNumber)
  const copyFromWeek1 = () => {
    if (!week1SameDay) return
    const source = byDay[week1SameDay.id] ?? []
    if (source.length === 0) {
      setMessage({ kind: 'error', text: `Week 1 の Day ${current?.dayNumber} にはまだ種目がありません` })
      return
    }
    if (exercises.length > 0 && !window.confirm(`今の内容を Week 1 の Day ${current?.dayNumber} で置き換えますか？`)) return
    updateDay(dayId, () => source.map(ex => ({ ...ex, key: newKey(), sets: ex.sets.map(st => ({ ...st })) })))
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

  const chip = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${active ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`

  // 種目ごと表示: 選んだ種目が出てくる全週・全Day
  const occurrences = activeExercise
    ? sortedDays.flatMap(d => (byDay[d.id] ?? []).filter(ex => exerciseId(ex) === activeExercise.id).map(ex => ({ day: d, ex })))
    : []

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-4 space-y-3">
        {/* 1行目は表示を切り替えても高さ・位置が変わらない（切り替えボタンの位置を固定する） */}
        <div className="flex items-center gap-2">
          <Link href="/trainer/programs" onClick={goBack} className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={saveName}
            maxLength={60}
            className="flex-1 min-w-0 text-lg font-semibold bg-transparent text-black dark:text-white focus:outline-none"
          />
          <div className="shrink-0 flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
            {([['day', 'Dayごと'], ['exercise', '種目ごと']] as const).map(([v, text]) => (
              <button
                key={v}
                onClick={() => { setView(v); setMessage(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${view === v ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {view === 'day' ? (
          <>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
                <button key={w} onClick={() => selectWeek(w)} className={chip(w === week)}>Week {w}</button>
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
          </>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {exerciseOptions.length === 0 && <p className="text-xs text-zinc-400 py-1.5">まだ種目がありません。Dayごとの表示で種目を追加してください。</p>}
            {exerciseOptions.map(o => (
              <button key={o.id} onClick={() => setSelectedExercise(o.id)} className={chip(o.id === activeExercise?.id)}>{o.name}</button>
            ))}
          </div>
        )}
      </div>

      {view === 'day' ? (
        <div className="px-6 py-6 space-y-4 max-w-4xl">
          {week > 1 && week1SameDay && (
            <button onClick={copyFromWeek1} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <Copy className="w-4 h-4" />
              Week 1 の Day {current?.dayNumber} をコピー
            </button>
          )}

          {exercises.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">この日の種目はまだありません。</p>}

          {exercises.map((ex, exIdx) => (
            <div key={ex.key} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-400">{muscleLabel(ex.targetMuscle)}</p>
                  <p className="text-sm font-semibold text-black dark:text-white">{ex.name}</p>
                </div>
                <button onClick={() => move(ex.key, -1)} disabled={exIdx === 0} title="上へ" className="p-1.5 text-zinc-400 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(ex.key, 1)} disabled={exIdx === exercises.length - 1} title="下へ" className="p-1.5 text-zinc-400 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => updateDay(dayId, list => list.filter(e => e.key !== ex.key))} title="種目を外す" className="p-1.5 text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              <input
                value={ex.note}
                onChange={e => patchExercise(dayId, ex.key, x => ({ ...x, note: e.target.value }))}
                maxLength={200}
                placeholder="トレーナーからのコメント（任意）"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
              />
              <SetTable
                sets={ex.sets}
                onChange={(i, patch) => patchSet(dayId, ex.key, i, patch)}
                onRemove={i => patchExercise(dayId, ex.key, x => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))}
                onAdd={() => patchExercise(dayId, ex.key, x => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? blankSet()) }] }))}
              />
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
      ) : (
        <div className="px-6 py-6 space-y-4 max-w-4xl">
          {activeExercise && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {activeExercise.name}（{muscleLabel(activeExercise.targetMuscle)}）が出てくる {occurrences.length} 回分。週ごとの重量・回数の流れを見ながら直せます。
            </p>
          )}
          {occurrences.map(({ day, ex }) => (
            <div key={`${day.id}-${ex.key}`} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
              <p className="text-sm font-semibold text-black dark:text-white">
                Week {day.weekNumber} · Day {day.dayNumber}{dirty.has(day.id) ? ' ●' : ''}
              </p>
              <input
                value={ex.note}
                onChange={e => patchExercise(day.id, ex.key, x => ({ ...x, note: e.target.value }))}
                maxLength={200}
                placeholder="トレーナーからのコメント（任意）"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
              />
              <SetTable
                sets={ex.sets}
                onChange={(i, patch) => patchSet(day.id, ex.key, i, patch)}
                onRemove={i => patchExercise(day.id, ex.key, x => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))}
                onAdd={() => patchExercise(day.id, ex.key, x => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? blankSet()) }] }))}
              />
            </div>
          ))}
        </div>
      )}

      <div className="sticky bottom-16 md:bottom-0 z-10 px-6 py-3 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900 flex items-center gap-3">
        <p className={`flex-1 text-sm ${message?.kind === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {message?.text ?? (dirty.size > 0 ? `未保存の変更が ${dirty.size} 日分あります` : '')}
        </p>
        {view === 'day' ? (
          <button onClick={() => saveDays([dayId])} disabled={!dirty.has(dayId) || saving} className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-40">
            {saving ? '保存中...' : 'このDayを保存'}
          </button>
        ) : (
          <button onClick={() => saveDays([...dirty])} disabled={dirty.size === 0 || saving} className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-40">
            {saving ? '保存中...' : `変更をすべて保存（${dirty.size}日分）`}
          </button>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[20vh]">
          <div className="fixed inset-0 bg-black/60" onClick={() => resolvePending('cancel')} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">変更を保存しますか？</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {pending.saveIds.length === 1 ? `${label(pending.saveIds[0])} に未保存の変更があります。` : `${pending.saveIds.length}日分の未保存の変更があります。`}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => resolvePending('save')} disabled={saving} className="w-full py-3 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-50">
                {saving ? '保存中...' : '保存する'}
              </button>
              <button onClick={() => resolvePending('discard')} disabled={saving} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-red-500">
                保存しない
              </button>
              <button onClick={() => resolvePending('cancel')} disabled={saving} className="w-full py-3 text-sm text-zinc-500">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

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
