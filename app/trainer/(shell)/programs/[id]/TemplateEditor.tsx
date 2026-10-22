'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronLeft, Copy, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'
import ExercisePicker from './ExercisePicker'
import ExerciseLibrary, { LIBRARY_DRAG_TYPE, catalogKey } from './ExerciseLibrary'
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
/** Day の中の種目カードを並べ替えるときの dataTransfer の型名 */
const CARD_DRAG_TYPE = 'application/x-auxlog-card'
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
  // Tab キーは 重量 → 回数 → RIR → 次のセットの重量… の順に進む（2026-10-22 オーナー依頼）。
  // W-UP・重量の種類・セットの削除は tabIndex={-1} で Tab の移動先から外す（マウスでは今までどおり操作できる）。
  // 重量が「自動」のセットは重量の入力欄が無いので、回数から始まる。
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full max-w-2xl text-sm">
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
                  <input type="checkbox" tabIndex={-1} aria-label={`${i + 1}セット目をウォームアップにする`} checked={s.isWarmup} onChange={e => onChange(i, { isWarmup: e.target.checked })} />
                </td>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1">
                    <select tabIndex={-1} aria-label={`${i + 1}セット目の重量の種類`} value={s.mode} onChange={e => onChange(i, { mode: e.target.value as WeightMode, value: '' })} className={`${inputClass} text-xs`}>
                      {(Object.keys(MODE_LABELS) as WeightMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                    </select>
                    {s.mode !== 'auto' && (
                      <input inputMode="decimal" aria-label={`${i + 1}セット目の重量`} value={s.value} onChange={e => onChange(i, { value: e.target.value })} placeholder={s.mode === 'pct' ? '75' : '60'} className={`${inputClass} w-16`} />
                    )}
                  </div>
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" aria-label={`${i + 1}セット目の回数`} value={s.reps} onChange={e => onChange(i, { reps: e.target.value })} className={`${inputClass} w-16`} />
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" aria-label={`${i + 1}セット目のRIR`} value={s.rir} onChange={e => onChange(i, { rir: e.target.value })} placeholder="-" className={`${inputClass} w-12`} />
                </td>
                <td className="py-1">
                  <button tabIndex={-1} onClick={() => onRemove(i)} disabled={sets.length <= 1} title="セットを削除" className="p-1 text-zinc-300 hover:text-red-500 disabled:opacity-30">
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
  // 種目一覧から「独自の種目として作成」を押した時の名前（作成画面を開いた状態で ExercisePicker を出す）
  const [creatingName, setCreatingName] = useState<string | undefined>(undefined)
  // ドラッグ中に挿入位置として示す Day の種目の位置（list.length なら最後）
  const [dropIndex, setDropIndex] = useState<number | null>(null)
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
  const exerciseOptions: { id: string; name: string; targetMuscle: string | null; count: number }[] = []
  for (const d of sortedDays) {
    for (const ex of byDay[d.id] ?? []) {
      const id = exerciseId(ex)
      const found = exerciseOptions.find(o => o.id === id)
      if (found) found.count++
      else exerciseOptions.push({ id, name: ex.name, targetMuscle: ex.targetMuscle, count: 1 })
    }
  }
  // 種目ごと表示のカードは部位ごとに分ける（部位の並びは種目一覧と同じ）
  const exerciseGroups = [
    ...MUSCLE_ORDER.map(m => ({ key: m as string, label: TARGET_MUSCLE_LABELS[m], items: exerciseOptions.filter(o => o.targetMuscle === m) })),
    { key: 'other', label: 'その他', items: exerciseOptions.filter(o => !MUSCLE_ORDER.includes(o.targetMuscle as TargetMuscle)) },
  ].filter(g => g.items.length > 0)
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

  // Day・週を移っても未保存の変更はそのまま残す（Day に ● が付く）。「保存しますか？」は編集画面を
  // 離れる時（戻る・サイドバーのタブ）にまとめて聞く（2026-10-22 オーナー依頼）。
  const selectDay = (id: string) => {
    if (id !== dayId) { setMessage(null); setDayId(id) }
  }

  const selectWeek = (w: number) => {
    // 週を変えても同じ Day 番号を開く（無ければその週の最初の Day）
    const target = days.find(d => d.weekNumber === w && d.dayNumber === current?.dayNumber) ?? days.find(d => d.weekNumber === w)
    if (target && target.id !== dayId) { setMessage(null); setWeek(w); setDayId(target.id) }
  }

  // 未保存のまま画面内のリンク（サイドバーのタブなど）で離れようとしたら確認する。
  // タブを閉じる・読み込み直す時はブラウザ標準の確認を出す。
  useEffect(() => {
    if (dirty.size === 0) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      const href = a?.getAttribute('href')
      if (!a || !href || !href.startsWith('/') || a.target === '_blank') return
      e.preventDefault()
      e.stopPropagation()
      setPending({ saveIds: [...dirty], proceed: () => router.push(href) })
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, router])

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

  const addExercise = (ex: CatalogExercise, at?: number) => {
    const item: EditorExercise = { key: newKey(), ...ex, note: '', sets: [blankSet(), blankSet(), blankSet()] }
    updateDay(dayId, list => {
      const i = at == null ? list.length : Math.max(0, Math.min(at, list.length))
      return [...list.slice(0, i), item, ...list.slice(i)]
    })
    setPicking(false)
    setCreatingName(undefined)
  }

  // ドラッグ＆ドロップ: 右の種目一覧から追加、または Day の中の種目カードを並べ替え
  const isOurDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(LIBRARY_DRAG_TYPE) || e.dataTransfer.types.includes(CARD_DRAG_TYPE)
  const onDragOverAt = (e: React.DragEvent, index: number) => {
    if (!isOurDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(CARD_DRAG_TYPE) ? 'move' : 'copy'
    if (dropIndex !== index) setDropIndex(index)
  }
  const onDropAt = (e: React.DragEvent, index: number) => {
    if (!isOurDrag(e)) return
    e.preventDefault()
    setDropIndex(null)
    const cardKey = e.dataTransfer.getData(CARD_DRAG_TYPE)
    if (cardKey) {
      updateDay(dayId, list => {
        const from = list.findIndex(x => x.key === cardKey)
        if (from < 0) return list
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(from < index ? index - 1 : index, 0, moved)
        return next
      })
      return
    }
    const ex = catalog.find(c => catalogKey(c) === e.dataTransfer.getData(LIBRARY_DRAG_TYPE))
    if (ex && exercises.length < 30) addExercise(ex, index)
  }
  // カードの上半分に重ねたらその前、下半分ならその後ろに入れる
  const onDragOverCard = (e: React.DragEvent, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onDragOverAt(e, e.clientY < rect.top + rect.height / 2 ? index : index + 1)
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
    `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${active ? 'bg-brand-soft text-brand-text' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-black dark:hover:text-white'}`

  // 種目ごと表示: 選んだ種目が出てくる全週・全Day
  const occurrences = activeExercise
    ? sortedDays.flatMap(d => (byDay[d.id] ?? []).filter(ex => exerciseId(ex) === activeExercise.id).map(ex => ({ day: d, ex })))
    : []

  return (
    // PC（lg以上）は画面の高さに固定し、編集欄と右の種目一覧をそれぞれスクロールさせる
    <div className="lg:h-screen lg:flex lg:flex-col">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-4 space-y-3">
        {/* 1行目は表示を切り替えても高さ・位置が変わらない（切り替えボタンの位置を固定する） */}
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
          <div className="shrink-0 flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
            {([['day', 'Dayごと'], ['exercise', '種目ごと']] as const).map(([v, text]) => (
              <button
                key={v}
                onClick={() => { setView(v); setMessage(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${view === v ? 'bg-white dark:bg-zinc-800 text-brand-text font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'}`}
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
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${d.id === dayId ? 'border-brand bg-brand-soft text-brand-text' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}
                >
                  Day {d.dayNumber}{dirty.has(d.id) ? ' ●' : ''}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="lg:flex-1 lg:min-h-0 lg:flex">
      {view === 'exercise' && (
        // 種目ごと表示: テンプレートに出てくる種目を部位ごとのカードで並べ、選んだ種目の全週を右に出す
        <aside className="px-6 pt-6 lg:p-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-r border-zinc-100 dark:border-zinc-900 lg:bg-zinc-50 lg:dark:bg-zinc-950 space-y-4">
          {exerciseOptions.length === 0 && <p className="text-xs text-zinc-400">まだ種目がありません。Dayごとの表示で種目を追加してください。</p>}
          {exerciseGroups.map(g => (
            <div key={g.key} className="space-y-1.5">
              <p className="text-[11px] font-semibold text-zinc-400">{g.label}</p>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                {g.items.map(o => {
                  const active = o.id === activeExercise?.id
                  return (
                    <button
                      key={o.id}
                      onClick={() => setSelectedExercise(o.id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                        active
                          ? 'border-brand bg-brand-soft'
                          : 'border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <p className={`text-[13px] font-semibold leading-snug ${active ? 'text-brand-text' : 'text-black dark:text-white'}`}>{o.name}</p>
                      <p className={`text-[11px] ${active ? 'text-brand-text/70' : 'text-zinc-400'}`}>{o.count}回</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </aside>
      )}
      {/* Day ごと表示では、この列のどこに落としても追加できる（種目カードの上なら、その前後に入る） */}
      <div
        className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto"
        onDragOver={view === 'day' ? e => onDragOverAt(e, exercises.length) : undefined}
        onDrop={view === 'day' ? e => onDropAt(e, dropIndex ?? exercises.length) : undefined}
        onDragLeave={view === 'day' ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null) } : undefined}
      >
      {view === 'day' ? (
        <div className="px-6 py-6 space-y-4">
          {week > 1 && week1SameDay && (
            <button onClick={copyFromWeek1} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <Copy className="w-4 h-4" />
              Week 1 の Day {current?.dayNumber} をコピー
            </button>
          )}

          {exercises.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">この日の種目はまだありません。</p>}

          {exercises.map((ex, exIdx) => (
            <div key={ex.key} className="relative" onDragOver={e => { e.stopPropagation(); onDragOverCard(e, exIdx) }} onDrop={e => { e.stopPropagation(); onDropAt(e, dropIndex ?? exIdx) }}>
            {dropIndex === exIdx && <div className="absolute -top-2.5 left-0 right-0 h-1 rounded-full bg-zinc-500 dark:bg-zinc-400" />}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
              <div className="flex items-start gap-2">
                <div
                  draggable
                  onDragStart={e => { e.dataTransfer.setData(CARD_DRAG_TYPE, ex.key); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => setDropIndex(null)}
                  title="ドラッグで並べ替え"
                  className="hidden lg:block pt-1 -ml-2 text-zinc-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
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
            </div>
          ))}

          <button
            onClick={() => setPicking(true)}
            disabled={exercises.length >= 30}
            onDragOver={e => { e.stopPropagation(); onDragOverAt(e, exercises.length) }}
            onDrop={e => { e.stopPropagation(); onDropAt(e, exercises.length) }}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed text-sm disabled:opacity-30 transition-colors ${
              dropIndex === exercises.length
                ? 'border-zinc-500 dark:border-zinc-400 text-black dark:text-white bg-zinc-100 dark:bg-zinc-900'
                : 'border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="lg:hidden">種目を追加</span>
            <span className="hidden lg:inline">右の一覧から種目をドラッグ、またはクリックして追加</span>
          </button>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
            重量の「%1RM」はトレーニーを追加するときに入力する1RMから kg を計算します。「自動」は前回の記録から重量を提案します（アイソレーション種目向け）。
          </p>
        </div>
      ) : (
        <div className="px-6 py-6 space-y-4">
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
      </div>
      {view === 'day' && (
        <aside className="hidden lg:block lg:w-72 lg:shrink-0 border-l border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
          <ExerciseLibrary
            catalog={catalog}
            onAdd={ex => addExercise(ex)}
            onCreate={nameText => setCreatingName(nameText)}
            disabled={exercises.length >= 30}
          />
        </aside>
      )}
      </div>

      <div className="sticky bottom-16 md:bottom-0 z-10 px-6 py-3 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900 flex items-center gap-3">
        <p className={`flex-1 text-sm ${message?.kind === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {message?.text ?? (dirty.size > 0 ? `未保存の変更が ${dirty.size} 日分あります` : '')}
        </p>
        <button onClick={() => saveDays([...dirty])} disabled={dirty.size === 0 || saving} className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-40">
          {saving ? '保存中...' : dirty.size > 0 ? `変更を保存（${dirty.size}日分）` : '保存済み'}
        </button>
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
              <button onClick={() => resolvePending('save')} disabled={saving} className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
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

      {(picking || creatingName) && (
        <ExercisePicker
          catalog={catalog}
          initialQuery={creatingName}
          onPick={ex => addExercise(ex)}
          onCreated={ex => { setCatalog(prev => [ex, ...prev]); addExercise(ex) }}
          onClose={() => { setPicking(false); setCreatingName(undefined) }}
        />
      )}
    </div>
  )
}
