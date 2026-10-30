'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { TraineeDetail } from '@/lib/trainer/trainees'
import { condenseTargetSets, type CoachingDay } from '@/lib/coaching/trainee'
import type { CoachingRecordData } from '@/lib/coaching/record'
import { todayInJapan } from '@/lib/coaching/week_dates'
import { formatCardio } from '@/lib/record/cardio'
import { toDecimalInput as toDecimal, toIntegerInput as toInteger } from '@/lib/utils/number_input'
import {
  draftFromPrefill, nextSet, recordedPlanExerciseIds, toEditSessions, toSavePayload,
  type EditCardio, type EditExercise, type EditSession, type EditSet,
} from '@/lib/trainer/clientRecordEditor'

// クライアントの記録をトレーナーがその場で直す・代わりに入力する（2026-10-29 オーナー決定: 代理入力も含める・
// 契約中のクライアントだけ・入力者を残して出す）。✓ を付けたセットが記録になる。
// 代理入力は今週のメニュー（アコーディオン）から「記録する」ボタンで保存する（2026-10-30 オーナー指示で自動保存にしない）。
// 今までの記録の「直す」は入力が止まると記録ごとに自動で保存し、⌘Z / Ctrl+Z で元に戻す。消した記録も元に戻すで同じ記録として作り直す。
// editable が false（契約中でない・自分）の時は今までどおり読むだけ。

const AUTOSAVE_MS = 800
const HISTORY_MERGE_MS = 1000
const HISTORY_LIMIT = 100

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
const inputClass = 'px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums text-black dark:text-white'
const RECORDED_BY_LABELS = { trainer: 'トレーナーが記録', trainer_edited: 'トレーナーが修正' } as const

type Props = {
  traineeId: string
  sessions: TraineeDetail['sessions']
  /** 今週のメニュー（進行中のプランがある時だけ） */
  week: { weekNumber: number; days: CoachingDay[] } | null
  editable: boolean
  title: string
}

export default function ClientRecords({ traineeId, sessions: initialSessions, week, editable, title }: Props) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const [sessions, setSessions] = useState<EditSession[]>(() => toEditSessions(initialSessions))
  const sessionsRef = useRef(sessions)
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  // 「直す」で開いている記録（代理入力の新しい記録は最初から開く）
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadingPe, setLoadingPe] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dayIdx, setDayIdx] = useState(0)

  // DB にある記録（保存した・読み込んだ記録）。✓ をすべて外した記録・消した記録は、これにある時だけ消しに行く
  const exists = useRef(new Set(initialSessions.map(s => s.id)))
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // 記録ごとの保存を1つずつ順番にする（前の保存が終わってから、その時の最新の内容で保存する）
  const queue = useRef(new Map<string, Promise<boolean>>())

  // 読み込んだ時に記録済みだったプランの種目（今週のメニューの「記録済み」を、画面で外した時に戻すため）
  const initiallyRecorded = useMemo(() => recordedPlanExerciseIds(toEditSessions(initialSessions)), [initialSessions])
  const recordedNow = recordedPlanExerciseIds(sessions)

  // ── 元に戻す・やり直す（テンプレート編集と同じ: 同じ記録で1秒以内に続いた変更は1回分） ──
  const [undoStack, setUndoStack] = useState<EditSession[][]>([])
  const [redoStack, setRedoStack] = useState<EditSession[][]>([])
  const lastEdit = useRef<{ id: string; at: number } | null>(null)
  const recordedThisTurn = useRef(false)
  const recordHistory = (id: string) => {
    if (recordedThisTurn.current) return
    recordedThisTurn.current = true
    queueMicrotask(() => { recordedThisTurn.current = false })
    const now = Date.now()
    const merge = lastEdit.current?.id === id && now - lastEdit.current.at < HISTORY_MERGE_MS
    lastEdit.current = { id, at: now }
    if (merge) return
    const before = sessionsRef.current
    setUndoStack(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), before])
    setRedoStack([])
  }
  const restore = (target: EditSession[]) => {
    const current = sessionsRef.current
    const byId = (list: EditSession[]) => new Map(list.map(s => [s.id, s]))
    const a = byId(current)
    const b = byId(target)
    const changed = [...new Set([...a.keys(), ...b.keys()])].filter(id => a.get(id) !== b.get(id))
    setSessions(target)
    sessionsRef.current = target
    lastEdit.current = null
    setNotice(null)
    changed.forEach(scheduleSave)
  }
  const undo = () => {
    const target = undoStack[undoStack.length - 1]
    if (!target) return
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, sessionsRef.current])
    restore(target)
  }
  const redo = () => {
    const target = redoStack[redoStack.length - 1]
    if (!target) return
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, sessionsRef.current])
    restore(target)
  }
  const undoRef = useRef({ undo, redo })
  useEffect(() => { undoRef.current = { undo, redo } })
  useEffect(() => {
    if (!editable) return
    // この欄の中（か、どこにも入力していない時）だけ。名前の欄などの ⌘Z は文字の取り消しのまま
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target && target !== document.body && !rootRef.current?.contains(target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current.undo() }
      else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) { e.preventDefault(); undoRef.current.redo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editable])

  // ── 保存 ──
  const saveNow = async (id: string): Promise<boolean> => {
    const session = sessionsRef.current.find(s => s.id === id)
    const payload = session ? toSavePayload(session) : { ok: true as const, sets: [] }
    if (!payload.ok) {
      setErrors(prev => ({ ...prev, [id]: `${payload.error}（入力するまで保存されません）` }))
      return false
    }
    // ✓ が無い記録: DB にあれば消す、無ければ（✓ を付ける前の代理入力）何もしない
    if (payload.sets.length === 0 && !exists.current.has(id)) {
      setErrors(prev => { const next = { ...prev }; delete next[id]; return next })
      return true
    }
    setSavingIds(prev => new Set(prev).add(id))
    try {
      const res = payload.sets.length === 0
        ? await fetch(`/api/trainer/client-sessions/${id}`, { method: 'DELETE' })
        : await fetch(`/api/trainer/client-sessions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trainee_id: traineeId, trained_at: session!.trainedOn, sets: payload.sets }),
          })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '保存に失敗しました')
      }
      if (payload.sets.length === 0) exists.current.delete(id)
      else {
        const created = !exists.current.has(id)
        exists.current.add(id)
        // クライアントの記録を直したら「トレーナーが修正」を付ける（DB と同じ）
        if (!created) setSessions(prev => prev.map(s => (s.id === id && s.recordedBy == null ? { ...s, recordedBy: 'trainer_edited' } : s)))
      }
      setErrors(prev => { const next = { ...prev }; delete next[id]; return next })
      return true
    } catch (e) {
      setErrors(prev => ({ ...prev, [id]: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '保存できませんでした。通信を確かめてください' }))
      return false
    } finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const flush = (id: string): Promise<boolean> => {
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
    const run = (queue.current.get(id) ?? Promise.resolve(true)).then(() => saveNow(id))
    queue.current.set(id, run)
    run.finally(() => {
      if (queue.current.get(id) === run) queue.current.delete(id)
      // すべて保存し終えたら、上のプランの進み具合・アラートを読み直す（この欄の入力はそのまま）
      if (queue.current.size === 0 && timers.current.size === 0) router.refresh()
    })
    return run
  }
  function scheduleSave(id: string) {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); flush(id) }, AUTOSAVE_MS))
  }
  // 別のクライアント・画面に移る時は、待っている保存をすぐ送る
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })
  useEffect(() => () => { for (const id of [...timers.current.keys()]) flushRef.current(id) }, [])
  // 保存が残っている間にタブを閉じようとしたら確かめる
  const pending = savingIds.size > 0 || Object.keys(errors).length > 0
  useEffect(() => {
    if (!pending) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pending])

  // ── 編集 ──
  const updateSession = (id: string, fn: (s: EditSession) => EditSession) => {
    recordHistory(id)
    const next = sessionsRef.current.map(s => (s.id === id ? fn(s) : s))
    setSessions(next)
    sessionsRef.current = next
    setNotice(null)
    scheduleSave(id)
  }
  const patchExercise = (id: string, key: string, fn: (e: EditExercise) => EditExercise) =>
    updateSession(id, s => ({ ...s, exercises: s.exercises.map(e => (e.key === key ? fn(e) : e)) }))
  const patchSet = (id: string, exKey: string, setKey: string, patch: Partial<EditSet>) =>
    patchExercise(id, exKey, e => ({ ...e, sets: e.sets.map(st => (st.key === setKey ? { ...st, ...patch } : st)) }))
  const patchCardio = (id: string, exKey: string, patch: Partial<EditCardio>) =>
    patchExercise(id, exKey, e => (e.cardio ? { ...e, cardio: { ...e.cardio, ...patch } } : e))

  const removeSession = (id: string) => {
    recordHistory(id)
    const next = sessionsRef.current.filter(s => s.id !== id)
    setSessions(next)
    sessionsRef.current = next
    setNotice('記録を消しました')
    scheduleSave(id)
  }

  // ── 代理入力（2026-10-30 オーナー指示: 自動保存にせず「記録する」で保存。メニューはアコーディオン） ──
  // 種目を押すと下に計画（目標のセット）と入力欄を開く（一度に1つ）。✓ を付けたセットだけを「記録する」で保存する
  const [openPe, setOpenPe] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, EditSession>>({})
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({})
  const [recordingPe, setRecordingPe] = useState<string | null>(null)

  const togglePlanExercise = async (planExerciseId: string, recorded: boolean) => {
    if (openPe === planExerciseId) { setOpenPe(null); return }
    setOpenPe(planExerciseId)
    if (recorded || drafts[planExerciseId]) return
    setLoadingPe(planExerciseId)
    try {
      const res = await fetch(`/api/trainer/client-sessions/prefill?trainee=${traineeId}&planExercise=${planExerciseId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '種目を読み込めませんでした')
      setDrafts(prev => ({ ...prev, [planExerciseId]: draftFromPrefill(crypto.randomUUID(), todayInJapan(), data as CoachingRecordData) }))
      setDraftErrors(prev => { const next = { ...prev }; delete next[planExerciseId]; return next })
    } catch (e) {
      setDraftErrors(prev => ({ ...prev, [planExerciseId]: e instanceof Error ? e.message : '種目を読み込めませんでした' }))
    } finally {
      setLoadingPe(null)
    }
  }

  const patchDraft = (planExerciseId: string, fn: (e: EditExercise) => EditExercise) => {
    setDrafts(prev => {
      const d = prev[planExerciseId]
      return d ? { ...prev, [planExerciseId]: { ...d, exercises: d.exercises.map(fn) } } : prev
    })
    setDraftErrors(prev => { const next = { ...prev }; delete next[planExerciseId]; return next })
  }

  const recordDraft = async (planExerciseId: string) => {
    const draft = drafts[planExerciseId]
    if (!draft) return
    const payload = toSavePayload(draft)
    const fail = (text: string) => setDraftErrors(prev => ({ ...prev, [planExerciseId]: text }))
    if (!payload.ok) return fail(payload.error)
    if (payload.sets.length === 0) return fail('実施したセットに ✓ を付けてください')
    setRecordingPe(planExerciseId)
    try {
      const res = await fetch(`/api/trainer/client-sessions/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainee_id: traineeId, trained_at: draft.trainedOn, sets: payload.sets }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '記録できませんでした')
      }
      // 記録した内容（✓ のセットだけ）を下の記録の一番上に足す。ここからは他の記録と同じく「直す」で直す
      exists.current.add(draft.id)
      const saved: EditSession = { ...draft, exercises: draft.exercises.map(e => ({ ...e, sets: e.sets.filter(st => st.done) })) }
      const next = [saved, ...sessionsRef.current]
      setSessions(next)
      sessionsRef.current = next
      setDrafts(prev => { const n = { ...prev }; delete n[planExerciseId]; return n })
      router.refresh()
    } catch (e) {
      fail(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '記録できませんでした。通信を確かめてください')
    } finally {
      setRecordingPe(null)
    }
  }

  // 記録済みの種目の「記録を直す」: 下の記録を開いてそこへ移る
  const openRecordOf = (planExerciseId: string) => {
    const found = sessionsRef.current.find(s => s.exercises.some(e => e.planExerciseId === planExerciseId))
    if (!found) return
    setOpen(prev => new Set(prev).add(found.id))
    document.getElementById(`record-${found.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const day = week?.days[Math.min(dayIdx, (week?.days.length ?? 1) - 1)]

  return (
    <div ref={rootRef} className="space-y-5">
      {editable && week && day && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-400">今週のメニュー（Week {week.weekNumber}）</p>
            {week.days.length > 1 && (
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {week.days.map((d, i) => (
                  <button
                    key={d.planDayId}
                    onClick={() => setDayIdx(i)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border ${d.planDayId === day.planDayId ? 'border-brand bg-brand-soft text-brand-text' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'}`}
                  >
                    Day {d.dayNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
          {day.exercises.length === 0 ? (
            <p className="text-sm text-zinc-400">この日の種目はありません。</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {day.exercises.map(ex => {
                const recorded = recordedNow.has(ex.planExerciseId) || (ex.recorded && !initiallyRecorded.has(ex.planExerciseId))
                const isOpen = openPe === ex.planExerciseId
                const draft = drafts[ex.planExerciseId]
                const recordedExercises = sessions.flatMap(se => se.exercises.filter(e => e.planExerciseId === ex.planExerciseId))
                const error = draftErrors[ex.planExerciseId]
                return (
                  <div key={ex.planExerciseId}>
                    <button onClick={() => togglePlanExercise(ex.planExerciseId, recorded)} aria-expanded={isOpen} className="w-full flex items-center gap-3 py-3 text-left">
                      <span className="flex-1 min-w-0 text-sm text-black dark:text-white truncate">{ex.name}</span>
                      {recorded
                        ? <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-text"><Check className="w-3.5 h-3.5" />記録済み</span>
                        : ex.skipped
                        ? <span className="shrink-0 text-xs text-zinc-400">スキップ</span>
                        : draft?.exercises.some(e => e.cardio ? e.cardio.done : e.sets.some(st => st.done))
                        ? <span className="shrink-0 text-xs text-zinc-500">記録中</span>
                        : null}
                      <ChevronDown className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="pb-4 space-y-3">
                        {/* 計画（トレーナーが決めた目標のセットとメモ） */}
                        <div className="space-y-0.5">
                          {condenseTargetSets(ex).map((r, i) => (
                            <p key={i} className="text-xs tabular-nums">
                              <span className="inline-block w-16 text-zinc-400">{r.label}</span>
                              <span className="text-zinc-600 dark:text-zinc-300">{r.text}</span>
                            </p>
                          ))}
                          {ex.note && <p className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap pt-1">{ex.note}</p>}
                        </div>
                        {recorded ? (
                          <div className="space-y-1.5">
                            {recordedExercises.map(e => <p key={e.key} className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">記録 {summary(e)}</p>)}
                            {recordedExercises.length > 0 && (
                              <button onClick={() => openRecordOf(ex.planExerciseId)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-black dark:hover:text-white">
                                <Pencil className="w-3.5 h-3.5" />記録を直す
                              </button>
                            )}
                          </div>
                        ) : loadingPe === ex.planExerciseId ? (
                          <p className="text-xs text-zinc-400">読み込み中…</p>
                        ) : draft ? (
                          <div className="space-y-2">
                            {draft.exercises.map(e => (
                              <ExerciseInputs
                                key={e.key}
                                exercise={e}
                                onSet={(k, p) => patchDraft(ex.planExerciseId, x => ({ ...x, sets: x.sets.map(st => (st.key === k ? { ...st, ...p } : st)) }))}
                                onCardio={p => patchDraft(ex.planExerciseId, x => (x.cardio ? { ...x, cardio: { ...x.cardio, ...p } } : x))}
                                onAddSet={() => patchDraft(ex.planExerciseId, x => ({ ...x, sets: [...x.sets, nextSet(x.sets)] }))}
                              />
                            ))}
                            {error && <p className="text-xs text-red-500">{error}</p>}
                            <button
                              onClick={() => recordDraft(ex.planExerciseId)}
                              disabled={recordingPe != null}
                              className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-semibold disabled:opacity-40"
                            >
                              {recordingPe === ex.planExerciseId ? '記録中…' : '記録する'}
                            </button>
                          </div>
                        ) : (
                          error && <p className="text-xs text-red-500">{error}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-400">{title}</p>
          {editable && (
            <div className="flex items-center gap-1">
              {notice && <span className="text-xs text-zinc-500 mr-1">{notice}</span>}
              <button onClick={undo} disabled={undoStack.length === 0} title="元に戻す（⌘Z / Ctrl+Z）" aria-label="元に戻す" className="p-1.5 rounded-lg text-zinc-500 enabled:hover:text-black enabled:hover:bg-zinc-100 dark:enabled:hover:text-white dark:enabled:hover:bg-zinc-900 disabled:opacity-30">
                <Undo2 className="w-4 h-4" />
              </button>
              <button onClick={redo} disabled={redoStack.length === 0} title="やり直す（⇧⌘Z / Ctrl+Y）" aria-label="やり直す" className="p-1.5 rounded-lg text-zinc-500 enabled:hover:text-black enabled:hover:bg-zinc-100 dark:enabled:hover:text-white dark:enabled:hover:bg-zinc-900 disabled:opacity-30">
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {editable && <p className="text-xs text-zinc-400 dark:text-zinc-500">「直す」で直した記録は、入力が止まると自動で保存します（✓ を外したセットは記録から外れます）。クライアントの画面には「トレーナーが修正」と出ます。</p>}
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">まだ記録がありません。</p>
        ) : (
          sessions.map(s => {
            const isOpen = editable && (open.has(s.id) || !exists.current.has(s.id))
            const status = savingIds.has(s.id) ? '保存中…' : errors[s.id] ?? null
            return (
              <div key={s.id} id={`record-${s.id}`} className="px-5 py-4 rounded-2xl trainer-card space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-black dark:text-white">{fmtDate(s.trainedOn)}</p>
                  {s.recordedBy && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-soft text-brand-text">{RECORDED_BY_LABELS[s.recordedBy]}</span>}
                  {!exists.current.has(s.id) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">まだ保存されていません</span>}
                  <span className="flex-1" />
                  {editable && (isOpen ? (
                    exists.current.has(s.id) && <button onClick={() => setOpen(prev => { const n = new Set(prev); n.delete(s.id); return n })} className="text-xs text-zinc-500 hover:text-black dark:hover:text-white">閉じる</button>
                  ) : (
                    <button onClick={() => setOpen(prev => new Set(prev).add(s.id))} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-black dark:hover:text-white">
                      <Pencil className="w-3.5 h-3.5" />直す
                    </button>
                  ))}
                  {editable && (
                    <button onClick={() => removeSession(s.id)} title="この記録を消す" aria-label="この記録を消す" className="p-1 text-zinc-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {status && <p className={`text-xs ${errors[s.id] ? 'text-red-500' : 'text-zinc-400'}`}>{status}</p>}
                {s.exercises.map(e => (
                  <div key={e.key} className="text-sm">
                    <p className="text-black dark:text-white">
                      {e.name}
                      {/* トレーニーがホームの「種目を追加」から記録した、プランに無い種目 */}
                      {e.offPlan && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">プラン外</span>}
                    </p>
                    {isOpen
                      ? <ExerciseInputs exercise={e} onSet={(k, p) => patchSet(s.id, e.key, k, p)} onCardio={p => patchCardio(s.id, e.key, p)} onAddSet={() => patchExercise(s.id, e.key, x => ({ ...x, sets: [...x.sets, nextSet(x.sets)] }))} />
                      : <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{summary(e)}</p>}
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// 閉じている記録の1行（✓ のセットだけ）
function summary(e: EditExercise): string {
  if (e.cardio) {
    const minutes = Number(e.cardio.minutes)
    return e.cardio.done && minutes > 0
      ? formatCardio({ duration_seconds: Math.round(minutes * 60), distance_km: e.cardio.distanceKm || null, calories_kcal: e.cardio.calories ? Number(e.cardio.calories) : null })
      : '-'
  }
  const done = e.sets.filter(s => s.done)
  return done.length > 0 ? done.map(s => `${s.isWarmup ? 'W ' : ''}${s.weight || 0}kg×${s.reps}`).join(' / ') : '-'
}

// 開いている記録の種目: セットごとに 重量・回数・✓。Tab は 重量 → 回数 → 次のセットの重量… の順（✓・W は外す）
function ExerciseInputs({ exercise: e, onSet, onCardio, onAddSet }: {
  exercise: EditExercise
  onSet: (setKey: string, patch: Partial<EditSet>) => void
  onCardio: (patch: Partial<EditCardio>) => void
  onAddSet: () => void
}) {
  if (e.cardio) {
    const c = e.cardio
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1.5">
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input inputMode="decimal" aria-label="時間（分）" value={c.minutes} onChange={ev => onCardio({ minutes: toDecimal(ev.target.value) })} className={`${inputClass} w-16`} />分
        </label>
        {c.tracksDistance && (
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input inputMode="decimal" aria-label="距離（km）" value={c.distanceKm} onChange={ev => onCardio({ distanceKm: toDecimal(ev.target.value) })} placeholder="-" className={`${inputClass} w-16`} />km
          </label>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <input inputMode="numeric" aria-label="消費カロリー（kcal）" value={c.calories} onChange={ev => onCardio({ calories: toInteger(ev.target.value) })} placeholder="-" className={`${inputClass} w-16`} />kcal
        </label>
        <DoneButton done={c.done} label="有酸素運動" onClick={() => onCardio({ done: !c.done })} />
      </div>
    )
  }
  let working = 0
  return (
    <div className="pt-1.5 space-y-1.5">
      {e.sets.map(st => {
        const label = st.isWarmup ? 'W' : String(++working)
        return (
          <div key={st.key} className={`flex items-center gap-1.5 ${st.done ? '' : 'opacity-60'}`}>
            <button
              tabIndex={-1}
              onClick={() => onSet(st.key, { isWarmup: !st.isWarmup })}
              title="ウォームアップのセットにする・戻す"
              className={`w-7 shrink-0 text-center text-xs tabular-nums rounded-md py-1 ${st.isWarmup ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 font-semibold' : 'text-zinc-500'}`}
            >
              {label}
            </button>
            <input inputMode="decimal" aria-label={`${label}セット目の重量`} value={st.weight} onChange={ev => onSet(st.key, { weight: toDecimal(ev.target.value) })} placeholder={e.isBodyweight ? '自重' : 'kg'} className={`${inputClass} w-16`} />
            <span className="text-xs text-zinc-400">kg ×</span>
            <input inputMode="numeric" aria-label={`${label}セット目の回数`} value={st.reps} maxLength={3} onChange={ev => onSet(st.key, { reps: toInteger(ev.target.value) })} className={`${inputClass} w-14`} />
            <span className="text-xs text-zinc-400">回</span>
            <DoneButton done={st.done} label={`${label}セット目`} onClick={() => onSet(st.key, { done: !st.done })} />
          </div>
        )
      })}
      <button onClick={onAddSet} disabled={e.sets.length >= 20} className="text-xs text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-30">
        + セットを追加
      </button>
    </div>
  )
}

function DoneButton({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      tabIndex={-1}
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `${label}の記録を外す` : `${label}を記録する`}
      className={`ml-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border ${done ? 'border-brand bg-brand text-on-brand' : 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 hover:text-zinc-500'}`}
    >
      <Check className="w-4 h-4" />
    </button>
  )
}
