'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'
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
// クライアントの記録は自動では保存しない（2026-10-30 オーナー指示）: 代理入力は今週のメニュー（アコーディオン）の
// 「記録する」、今までの記録は「直す」→「保存する」で保存し、消す時は確かめる。
// editable が false（契約中でない・自分）の時は今までどおり読むだけ。

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
  // 保存済みの記録（画面の表示）。直している記録は editing に写しを持ち、「保存する」で初めてここと DB に反映する
  const [sessions, setSessions] = useState<EditSession[]>(() => toEditSessions(initialSessions))
  const [editing, setEditing] = useState<Record<string, EditSession>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dayIdx, setDayIdx] = useState(0)

  // 代理入力（今週のメニューのアコーディオン）: 種目を押すと下に計画と入力欄を開く（一度に1つ）
  const [openPe, setOpenPe] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, EditSession>>({})
  const [loadingPe, setLoadingPe] = useState<string | null>(null)

  // 読み込んだ時に記録済みだったプランの種目（今週のメニューの「記録済み」を、画面で消した時に戻すため）
  const initiallyRecorded = useMemo(() => recordedPlanExerciseIds(toEditSessions(initialSessions)), [initialSessions])
  const recordedNow = recordedPlanExerciseIds(sessions)

  const setError = (id: string, text: string | null) =>
    setErrors(prev => { const next = { ...prev }; if (text) next[id] = text; else delete next[id]; return next })

  // 保存していない入力（✓ を付けた代理入力・直している記録）がある間は、画面を離れる前に確かめる
  const unsaved = Object.keys(editing).length > 0 || Object.values(drafts).some(hasDone)
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    // 一覧の別のクライアント・サイドバーなど、画面の中のリンクで移る時
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a[href]')
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (!window.confirm('保存していない記録があります。保存せずに移動しますか？')) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [unsaved])

  // 記録を保存する（無ければ作る、あればセットを置き換える）。成功したら true
  const put = async (session: EditSession): Promise<boolean> => {
    const payload = toSavePayload(session)
    if (!payload.ok) { setError(session.id, payload.error); return false }
    if (payload.sets.length === 0) { setError(session.id, '実施したセットに ✓ を付けてください'); return false }
    setBusyId(session.id)
    setError(session.id, null)
    try {
      const res = await fetch(`/api/trainer/client-sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainee_id: traineeId, trained_at: session.trainedOn, sets: payload.sets }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '保存に失敗しました')
      }
      return true
    } catch (e) {
      setError(session.id, e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '保存できませんでした。通信を確かめてください')
      return false
    } finally {
      setBusyId(null)
    }
  }

  // 保存した内容（✓ のセットだけ）
  const doneOnly = (s: EditSession): EditSession => ({ ...s, exercises: s.exercises.map(e => ({ ...e, sets: e.sets.filter(st => st.done) })) })

  // ── 代理入力（2026-10-30 オーナー指示: 自動保存にせず「記録する」で保存） ──
  const togglePlanExercise = async (planExerciseId: string, recorded: boolean) => {
    if (openPe === planExerciseId) { setOpenPe(null); return }
    setOpenPe(planExerciseId)
    if (recorded || drafts[planExerciseId]) return
    setLoadingPe(planExerciseId)
    setError(planExerciseId, null)
    try {
      const res = await fetch(`/api/trainer/client-sessions/prefill?trainee=${traineeId}&planExercise=${planExerciseId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '種目を読み込めませんでした')
      setDrafts(prev => ({ ...prev, [planExerciseId]: draftFromPrefill(crypto.randomUUID(), todayInJapan(), data as CoachingRecordData) }))
    } catch (e) {
      setError(planExerciseId, e instanceof Error ? e.message : '種目を読み込めませんでした')
    } finally {
      setLoadingPe(null)
    }
  }

  const patchDraft = (planExerciseId: string, fn: (e: EditExercise) => EditExercise) =>
    setDrafts(prev => {
      const d = prev[planExerciseId]
      return d ? { ...prev, [planExerciseId]: { ...d, exercises: d.exercises.map(fn) } } : prev
    })

  const recordDraft = async (planExerciseId: string) => {
    const draft = drafts[planExerciseId]
    if (!draft) return
    if (!(await put(draft))) {
      // 代理入力のエラーは種目の下に出す
      setErrors(prev => { const next = { ...prev }; if (next[draft.id]) { next[planExerciseId] = next[draft.id]; delete next[draft.id] } return next })
      return
    }
    setError(planExerciseId, null)
    // 下の記録の一番上に足す。ここからは他の記録と同じく「直す」で直す
    setSessions(prev => [doneOnly(draft), ...prev])
    setDrafts(prev => { const n = { ...prev }; delete n[planExerciseId]; return n })
    router.refresh()
  }

  // 記録済みの種目の「記録を直す」: 下の記録を直す状態にして、そこへ移る
  const editRecordOf = (planExerciseId: string) => {
    const found = sessions.find(s => s.exercises.some(e => e.planExerciseId === planExerciseId))
    if (!found) return
    startEdit(found)
    requestAnimationFrame(() => document.getElementById(`record-${found.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  // ── 今までの記録を直す（「保存する」で保存、「やめる」で元のまま） ──
  const startEdit = (s: EditSession) => setEditing(prev => (prev[s.id] ? prev : { ...prev, [s.id]: s }))
  const cancelEdit = (id: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })
    setError(id, null)
  }
  const patchEditing = (id: string, exKey: string, fn: (e: EditExercise) => EditExercise) =>
    setEditing(prev => {
      const s = prev[id]
      return s ? { ...prev, [id]: { ...s, exercises: s.exercises.map(e => (e.key === exKey ? fn(e) : e)) } } : prev
    })
  const saveEdit = async (id: string) => {
    const s = editing[id]
    if (!s || !(await put(s))) return
    // クライアントの記録を直したら「トレーナーが修正」を付ける（DB と同じ）
    setSessions(prev => prev.map(x => (x.id === id ? { ...doneOnly(s), recordedBy: s.recordedBy ?? 'trainer_edited' } : x)))
    cancelEdit(id)
    router.refresh()
  }

  const removeSession = async (s: EditSession) => {
    if (!window.confirm(`${fmtDate(s.trainedOn)}の記録を消しますか？\nクライアントの記録から消え、元に戻せません。`)) return
    setBusyId(s.id)
    setError(s.id, null)
    try {
      const res = await fetch(`/api/trainer/client-sessions/${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '削除に失敗しました')
      }
      setSessions(prev => prev.filter(x => x.id !== s.id))
      cancelEdit(s.id)
      router.refresh()
    } catch (e) {
      setError(s.id, e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '削除できませんでした。通信を確かめてください')
    } finally {
      setBusyId(null)
    }
  }

  const day = week?.days[Math.min(dayIdx, (week?.days.length ?? 1) - 1)]
  const primaryButton = 'px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-semibold disabled:opacity-40'
  const secondaryButton = 'px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40'

  return (
    <div className="space-y-5">
      {editable && week && day && (
        <div className="px-5 py-4 rounded-2xl trainer-card space-y-3">
          {/* Day のボタンは見出しの下の段に置く（同じ段だと Day 4 以上でスマホの見出しが折り返す、2026-10-30 オーナー指摘） */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400">今週のメニュー（Week {week.weekNumber}）</p>
            {week.days.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
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
                const error = errors[ex.planExerciseId]
                return (
                  <div key={ex.planExerciseId}>
                    <button onClick={() => togglePlanExercise(ex.planExerciseId, recorded)} aria-expanded={isOpen} className="w-full flex items-center gap-3 py-3 text-left">
                      <span className="flex-1 min-w-0 text-sm text-black dark:text-white truncate">{ex.name}</span>
                      {recorded
                        ? <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-text"><Check className="w-3.5 h-3.5" />記録済み</span>
                        : ex.skipped
                        ? <span className="shrink-0 text-xs text-zinc-400">スキップ</span>
                        : draft && hasDone(draft)
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
                              <button onClick={() => editRecordOf(ex.planExerciseId)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-black dark:hover:text-white">
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
                            <div className="flex justify-end">
                              <button
                                onClick={() => recordDraft(ex.planExerciseId)}
                                disabled={busyId != null}
                                className={primaryButton}
                              >
                                {draft && busyId === draft.id ? '記録中…' : '記録する'}
                              </button>
                            </div>
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
        <p className="text-xs font-semibold text-zinc-400">{title}</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-4">まだ記録がありません。</p>
        ) : (
          sessions.map(saved => {
            const edit = editable ? editing[saved.id] : undefined
            const s = edit ?? saved
            const busy = busyId === s.id
            return (
              <div key={s.id} id={`record-${s.id}`} className={`px-5 py-4 rounded-2xl trainer-card space-y-2 ${edit ? 'ring-1 ring-brand' : ''}`}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-black dark:text-white">{fmtDate(s.trainedOn)}</p>
                  {s.recordedBy && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-soft text-brand-text">{RECORDED_BY_LABELS[s.recordedBy]}</span>}
                  <span className="flex-1" />
                  {editable && !edit && (
                    <button onClick={() => startEdit(saved)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-black dark:hover:text-white">
                      <Pencil className="w-3.5 h-3.5" />直す
                    </button>
                  )}
                  {editable && (
                    <button onClick={() => removeSession(saved)} disabled={busy} title="この記録を消す" aria-label="この記録を消す" className="p-1 text-zinc-400 hover:text-red-500 disabled:opacity-40">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {s.exercises.map(e => (
                  <div key={e.key} className="text-sm">
                    <p className="text-black dark:text-white">
                      {e.name}
                      {/* トレーニーがホームの「種目を追加」から記録した、プランに無い種目 */}
                      {e.offPlan && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">プラン外</span>}
                    </p>
                    {edit
                      ? <ExerciseInputs
                          exercise={e}
                          onSet={(k, p) => patchEditing(s.id, e.key, x => ({ ...x, sets: x.sets.map(st => (st.key === k ? { ...st, ...p } : st)) }))}
                          onCardio={p => patchEditing(s.id, e.key, x => (x.cardio ? { ...x, cardio: { ...x.cardio, ...p } } : x))}
                          onAddSet={() => patchEditing(s.id, e.key, x => ({ ...x, sets: [...x.sets, nextSet(x.sets)] }))}
                        />
                      : <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{summary(e)}</p>}
                  </div>
                ))}
                {errors[s.id] && <p className="text-xs text-red-500">{errors[s.id]}</p>}
                {edit && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">✓ を外したセットは記録から外れます。保存すると、クライアントの画面に「トレーナーが修正」と出ます。</p>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => cancelEdit(s.id)} disabled={busy} className={secondaryButton}>やめる</button>
                      <button onClick={() => saveEdit(s.id)} disabled={busyId != null} className={primaryButton}>{busy ? '保存中…' : '保存する'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** ✓ を付けたセット（有酸素は記録の ✓）がある */
function hasDone(s: EditSession): boolean {
  return s.exercises.some(e => (e.cardio ? e.cardio.done : e.sets.some(st => st.done)))
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
