'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronLeft, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import ExercisePicker from './ExercisePicker'
import SwapPicker, { type SwapScope } from './SwapPicker'
import ExerciseLibrary, { LIBRARY_DRAG_TYPE, catalogKey } from './ExerciseLibrary'
import ExerciseIndex, { type ExerciseOption } from './ExerciseIndex'
import SetTable, { blankSet } from './SetTable'
import CardioTargets from './CardioTargets'
import TemplateNameInput from './TemplateNameInput'
import { UnsavedLeaveDialog, useUnsavedLeaveGuard } from './UnsavedLeaveGuard'
import {
  newKey, toSavePayload, exerciseIdOf, isCardioExercise, muscleGroupLabel,
  type CatalogExercise, type EditorExercise, type EditorSet,
} from '@/lib/trainer/templateEditor'

export type EditorDay = { id: string; weekNumber: number; dayNumber: number; label?: string | null; exercises: EditorExercise[] }

// planId が null は取り込んだメニューの下書き（2026-10-28）。DB にはまだ何も無く、「保存」で初めてテンプレートを作る。
// 下書きはテンプレートの一覧の画面の中で開くので、「戻る」は onExit（保存するか確かめてから呼ぶ）
type Props = { planId: string | null; initialName: string; totalWeeks: number; days: EditorDay[]; catalog: CatalogExercise[]; onExit?: () => void }
type View = 'day' | 'exercise'

/** Day の中の種目カードを並べ替えるときの dataTransfer の型名 */
const CARD_DRAG_TYPE = 'application/x-auxlog-card'
const exerciseId = exerciseIdOf
const muscleLabel = muscleGroupLabel

// テンプレートの編集。表示は「Day ごと」（週 → Day を選んでその日の種目を編集）と「種目ごと」
// （種目を選んで、その種目が出てくる全週・全Dayのセットを並べて編集）を切り替えられる（2026-10-19 オーナー依頼）。
// 重量は %1RM（トレーニー追加時に1RMから kg を計算）・kg（固定）・自動（前回記録から提案）のどれか。
export default function TemplateEditor({ planId, initialName, totalWeeks, days, catalog: initialCatalog, onExit }: Props) {
  const router = useRouter()
  const isDraft = planId == null
  const [draftName, setDraftName] = useState(initialName)
  // 下書きを保存して作ったテンプレート（保存のあと、そのテンプレートの編集画面に移る）
  const createdId = useRef<string | null>(null)
  // 最後に保存した内容（「保存しない」を選んだときの戻り先）と、編集中の内容
  const [savedByDay, setSavedByDay] = useState<Record<string, EditorExercise[]>>(() => Object.fromEntries(days.map(d => [d.id, d.exercises])))
  const [byDay, setByDay] = useState<Record<string, EditorExercise[]>>(savedByDay)
  // 下書きは全部の Day が未保存
  const [dirty, setDirty] = useState<Set<string>>(() => new Set(isDraft ? days.map(d => d.id) : []))
  const [view, setView] = useState<View>('day')
  const [week, setWeek] = useState(1)
  const [dayId, setDayId] = useState(days.find(d => d.weekNumber === 1)?.id ?? days[0]?.id ?? '')
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [picking, setPicking] = useState(false)
  // 種目の入れ替え: Dayごと表示はそのカード、種目ごと表示はその種目（全週の出てくる所すべて）
  const [swap, setSwap] = useState<{ kind: 'card'; dayId: string; key: string } | { kind: 'exercise'; exerciseId: string } | null>(null)
  // 種目一覧から「独自の種目として作成」を押した時の名前（作成画面を開いた状態で ExercisePicker を出す）
  const [creatingName, setCreatingName] = useState<string | undefined>(undefined)
  // ドラッグ中に挿入位置として示す Day の種目の位置（list.length なら最後）
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
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
  const exerciseOptions: ExerciseOption[] = []
  for (const d of sortedDays) {
    for (const ex of byDay[d.id] ?? []) {
      const id = exerciseId(ex)
      const found = exerciseOptions.find(o => o.id === id)
      if (found) found.count++
      else exerciseOptions.push({ id, name: ex.name, targetMuscle: ex.targetMuscle, count: 1 })
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

  // 下書きを保存する: 全部の Day を確かめてから、テンプレートを1回で作る（途中で失敗しても DB に何も残らない）
  const createFromDraft = async (): Promise<boolean> => {
    const name = draftName.trim()
    if (!name) { setMessage({ kind: 'error', text: 'テンプレート名を入力してください' }); return false }
    const payloadDays = []
    for (const d of sortedDays) {
      const payload = toSavePayload(byDay[d.id] ?? [])
      if (!payload.ok) {
        // 直す所が見えるよう、その Day を開く
        setView('day'); setWeek(d.weekNumber); setDayId(d.id)
        setMessage({ kind: 'error', text: `${label(d.id)}: ${payload.error}` })
        return false
      }
      payloadDays.push({ week: d.weekNumber, day: d.dayNumber, label: d.label ?? null, exercises: payload.exercises })
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/trainer/templates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, total_weeks: totalWeeks, days_per_week: Math.max(...days.map(d => d.dayNumber)), days: payloadDays }),
      })
      const data = await res.json().catch(() => ({})) as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? '保存に失敗しました')
      createdId.current = data.id
      setDirty(new Set())
      return true
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : '保存に失敗しました' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // 指定した Day を保存する。1件でも入力エラー・保存失敗があれば false
  const saveDays = async (ids: string[]): Promise<boolean> => {
    if (isDraft) return createFromDraft()
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

  const { pending, resolvePending, confirmLeave } = useUnsavedLeaveGuard(dirty, saveDays, discardDays)

  const handleSaveClick = async () => {
    const ok = await saveDays([...dirty])
    if (ok && createdId.current) router.replace(`/trainer/programs/${createdId.current}`)
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

  // 入れ替え: 種目だけを替え、セット・回数・コメントはそのまま残す。
  // 1RM管理外の種目（マスタで requires_one_rm でない種目・独自の種目）に替える時は、%1RM のセットを
  // 「自動」（前回の記録から提案）に切り替える（2026-10-25 オーナー決定。1RMが無く %から重量を出せないため）
  const toSwapped = (ex: EditorExercise, to: CatalogExercise): EditorExercise => ({
    ...ex,
    exerciseMasterId: to.exerciseMasterId,
    trainerExerciseId: to.trainerExerciseId,
    cardioMasterId: to.cardioMasterId ?? null,
    name: to.name,
    targetMuscle: to.targetMuscle,
    sets: to.requiresOneRm ? ex.sets : ex.sets.map(st => (st.mode === 'pct' ? { ...st, mode: 'auto' as const, value: '' } : st)),
  })

  const swapSource = (() => {
    if (!swap) return null
    const ex = swap.kind === 'card'
      ? (byDay[swap.dayId] ?? []).find(e => e.key === swap.key)
      : sortedDays.flatMap(d => byDay[d.id] ?? []).find(e => exerciseId(e) === swap.exerciseId)
    if (!ex) return null
    const id = exerciseId(ex)
    const cat = catalog.find(c => exerciseId(c) === id)
    const dayList = swap.kind === 'card' ? byDay[swap.dayId] ?? [] : []
    // 1RM管理の種目の入れ替え（%1RM のセットがある、またはマスタで1RM管理の種目）か
    const sources = swap.kind === 'card' ? [ex] : sortedDays.flatMap(d => (byDay[d.id] ?? []).filter(e => exerciseId(e) === id))
    const oneRm = !!cat?.requiresOneRm || sources.some(e => e.sets.some(st => st.mode === 'pct'))
    return { ex, id, oneRm, movementPattern: cat?.movementPattern ?? null, inDay: new Set(dayList.map(exerciseId)) }
  })()

  const applySwap = (to: CatalogExercise, scope: SwapScope) => {
    if (!swap || !swapSource) return
    const fromId = swapSource.id
    if (swap.kind === 'card' && scope === 'this') {
      patchExercise(swap.dayId, swap.key, e => toSwapped(e, to))
    } else {
      // 全週の同じ Day（Dayごと表示）、または全週・全 Day（種目ごと表示）で、同じ種目をすべて入れ替える
      const dayNumber = swap.kind === 'card' ? days.find(d => d.id === swap.dayId)?.dayNumber : undefined
      for (const d of days) {
        if (dayNumber != null && d.dayNumber !== dayNumber) continue
        if (!(byDay[d.id] ?? []).some(e => exerciseId(e) === fromId)) continue
        updateDay(d.id, list => list.map(e => (exerciseId(e) === fromId ? toSwapped(e, to) : e)))
      }
      if (swap.kind === 'exercise') setSelectedExercise(exerciseId(to))
    }
    setSwap(null)
  }

  const addExercise = (ex: CatalogExercise, at?: number) => {
    // 有酸素はセットの代わりに目標の時間・距離を入れる（2026-10-26）
    const item: EditorExercise = isCardioExercise(ex)
      ? { key: newKey(), ...ex, note: '', sets: [], targetMinutes: '', targetDistanceKm: '' }
      : { key: newKey(), ...ex, note: '', sets: [blankSet(), blankSet(), blankSet()] }
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

  const chip = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${active ? 'bg-brand-soft text-brand-text' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-black dark:hover:text-white'}`

  // 種目ごと表示: 選んだ種目が出てくる全週・全Day
  const occurrences = activeExercise
    ? sortedDays.flatMap(d => (byDay[d.id] ?? []).filter(ex => exerciseId(ex) === activeExercise.id).map(ex => ({ day: d, ex })))
    : []

  return (
    // PC（lg以上）は画面の高さに固定し、編集欄と右の種目一覧をそれぞれスクロールさせる
    <div className="lg:h-screen lg:flex lg:flex-col">
      <div className="sticky top-0 z-10 trainer-header px-4 md:px-6 py-3 md:py-4 space-y-2 md:space-y-3">
        {/* 1行目は表示を切り替えても高さ・位置が変わらない（切り替えボタンの位置を固定する） */}
        <div className="flex items-center gap-2">
          {onExit ? (
            <button onClick={() => (dirty.size > 0 ? confirmLeave(onExit) : onExit())} aria-label="テンプレートの一覧に戻る" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link href="/trainer/programs" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          <TemplateNameInput planId={planId} initialName={initialName} onChange={setDraftName} />
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
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${d.id === dayId ? 'border-brand bg-brand-soft text-brand-text' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'}`}
                >
                  Day {d.dayNumber}{d.label ? `・${d.label}` : ''}{!isDraft && dirty.has(d.id) ? ' ●' : ''}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="lg:flex-1 lg:min-h-0 lg:flex">
      {view === 'exercise' && <ExerciseIndex options={exerciseOptions} activeId={activeExercise?.id ?? null} onSelect={setSelectedExercise} />}
      {/* Day ごと表示では、この列のどこに落としても追加できる（種目カードの上なら、その前後に入る） */}
      <div
        className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto"
        onDragOver={view === 'day' ? e => onDragOverAt(e, exercises.length) : undefined}
        onDrop={view === 'day' ? e => onDropAt(e, dropIndex ?? exercises.length) : undefined}
        onDragLeave={view === 'day' ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null) } : undefined}
      >
      {view === 'day' ? (
        <div className="px-4 md:px-6 py-4 md:py-6 space-y-4">
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
            <div className="px-4 md:px-5 py-4 rounded-2xl trainer-card space-y-3">
              <div className="flex items-start gap-1 md:gap-2">
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
                <button onClick={() => setSwap({ kind: 'card', dayId, key: ex.key })} title="種目を入れ替え" aria-label="種目を入れ替え" className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-black hover:bg-zinc-100">
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="hidden sm:inline">入れ替え</span>
                </button>
                <button onClick={() => move(ex.key, -1)} disabled={exIdx === 0} title="上へ" className="p-1.5 text-zinc-400 enabled:hover:text-black dark:enabled:hover:text-white disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(ex.key, 1)} disabled={exIdx === exercises.length - 1} title="下へ" className="p-1.5 text-zinc-400 enabled:hover:text-black dark:enabled:hover:text-white disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => updateDay(dayId, list => list.filter(e => e.key !== ex.key))} title="種目を外す" className="p-1.5 text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              {/* メモは「回数：」「重量：」のように1項目1行で書くので、複数行で入力できるようにする（2026-10-25） */}
              <textarea
                value={ex.note}
                onChange={e => patchExercise(dayId, ex.key, x => ({ ...x, note: e.target.value }))}
                maxLength={200}
                rows={Math.max(1, ex.note.split('\n').length)}
                placeholder="トレーナーからのコメント（任意）"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none resize-none"
              />
              {isCardioExercise(ex) ? (
                <CardioTargets
                  minutes={ex.targetMinutes ?? ''}
                  distanceKm={ex.targetDistanceKm ?? ''}
                  onChange={patch => patchExercise(dayId, ex.key, x => ({ ...x, ...patch }))}
                />
              ) : (
              <SetTable
                sets={ex.sets}
                onChange={(i, patch) => patchSet(dayId, ex.key, i, patch)}
                onRemove={i => patchExercise(dayId, ex.key, x => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))}
                onAdd={() => patchExercise(dayId, ex.key, x => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? blankSet()) }] }))}
              />
              )}
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
            <span className="hidden lg:inline whitespace-nowrap">右の一覧からドラッグ、またはクリックで追加</span>
          </button>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
            重量の「%1RM」はクライアントを追加するときに入力する1RMから kg を計算します。「自動」は前回の記録から重量を提案します（アイソレーション種目向け）。
          </p>
        </div>
      ) : (
        <div className="px-4 md:px-6 py-4 md:py-6 space-y-4">
          {activeExercise && (
            <div className="flex flex-col md:flex-row md:items-start gap-3">
              <p className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">
                {activeExercise.name}（{muscleLabel(activeExercise.targetMuscle)}）が出てくる {occurrences.length} 回分。週ごとの重量・回数の流れを見ながら直せます。
              </p>
              <button
                onClick={() => setSwap({ kind: 'exercise', exerciseId: activeExercise.id })}
                className="shrink-0 self-start flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-black dark:text-white hover:bg-zinc-50"
              >
                <ArrowLeftRight className="w-4 h-4" />
                この種目を入れ替え（{occurrences.length}回分）
              </button>
            </div>
          )}
          {occurrences.map(({ day, ex }) => (
            <div key={`${day.id}-${ex.key}`} className="px-4 md:px-5 py-4 rounded-2xl trainer-card space-y-3">
              <p className="text-sm font-semibold text-black dark:text-white">
                Week {day.weekNumber} / Day {day.dayNumber}{!isDraft && dirty.has(day.id) ? ' ●' : ''}
              </p>
              {/* メモは「回数：」「重量：」のように1項目1行で書くので、複数行で入力できるようにする（2026-10-25） */}
              <textarea
                value={ex.note}
                onChange={e => patchExercise(day.id, ex.key, x => ({ ...x, note: e.target.value }))}
                maxLength={200}
                rows={Math.max(1, ex.note.split('\n').length)}
                placeholder="トレーナーからのコメント（任意）"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none resize-none"
              />
              {isCardioExercise(ex) ? (
                <CardioTargets
                  minutes={ex.targetMinutes ?? ''}
                  distanceKm={ex.targetDistanceKm ?? ''}
                  onChange={patch => patchExercise(day.id, ex.key, x => ({ ...x, ...patch }))}
                />
              ) : (
              <SetTable
                sets={ex.sets}
                onChange={(i, patch) => patchSet(day.id, ex.key, i, patch)}
                onRemove={i => patchExercise(day.id, ex.key, x => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))}
                onAdd={() => patchExercise(day.id, ex.key, x => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? blankSet()) }] }))}
              />
              )}
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

      {/* スマホは帯を出さず、保存ボタンだけを右下に浮かせる（2026-10-25 オーナー依頼）。メッセージがある時だけ
          ボタンの左に小さく出す。下の種目を触れるよう、ボタンとメッセージ以外はタップを通す。PC は今までどおり帯 */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 px-4 md:px-6 py-3 pointer-events-none md:pointer-events-auto md:bg-white md:dark:bg-black md:border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-end gap-3">
        <p className={`pointer-events-auto md:flex-1 text-xs md:text-sm max-md:px-3 max-md:py-2 max-md:rounded-xl max-md:bg-white/95 max-md:shadow-md max-md:border max-md:border-zinc-100 ${message?.kind === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'} ${message?.text || dirty.size > 0 ? '' : 'max-md:hidden'}`}>
          {message?.text ?? (isDraft ? '取り込んだメニューは、保存するとテンプレートになります' : dirty.size > 0 ? `未保存の変更が ${dirty.size} 日分あります` : '')}
        </p>
        <button onClick={handleSaveClick} disabled={dirty.size === 0 || saving} className="pointer-events-auto shrink-0 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-40 max-md:shadow-lg max-md:disabled:opacity-100 max-md:disabled:bg-zinc-200 max-md:disabled:text-zinc-500">
          {saving ? '保存中…' : isDraft ? '保存してテンプレートを作成' : dirty.size > 0 ? `変更を保存（${dirty.size}日分）` : '保存済み'}
        </button>
      </div>

      {pending && (
        <UnsavedLeaveDialog
          pending={pending}
          saving={saving}
          label={label}
          message={isDraft ? '取り込んだメニューはまだ保存されていません。保存しないと、取り込んだ内容は消えます。' : undefined}
          onResolve={resolvePending}
        />
      )}

      {swap && swapSource && (
        <SwapPicker
          current={{ name: swapSource.ex.name, targetMuscle: swapSource.ex.targetMuscle, movementPattern: swapSource.movementPattern, isMaster: !!swapSource.ex.exerciseMasterId, id: swapSource.id }}
          oneRmSource={swapSource.oneRm}
          catalog={catalog}
          inDay={swapSource.inDay}
          scope={swap.kind === 'card' ? { dayNumber: days.find(d => d.id === swap.dayId)?.dayNumber ?? 1, totalWeeks } : undefined}
          onPick={applySwap}
          onClose={() => setSwap(null)}
        />
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
