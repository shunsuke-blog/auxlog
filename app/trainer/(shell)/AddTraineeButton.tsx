'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus } from 'lucide-react'

export type TemplateOption = {
  id: string
  name: string
  // テンプレート内で %1RM を使っている種目（追加時に1RMを入力すると kg が入る）
  oneRmExercises: { exerciseMasterId: string | null; trainerExerciseId: string | null; name: string }[]
}

type Issued = { code: string; expires_at: string; link_id: string }

// トレーニーの追加（2026-10-19 決定）: 共有するテンプレートを選ぶ → 招待コードを発行する。
// テンプレートの %1RM の種目は、ここで入力した1RMから kg を計算する（未入力なら重量は自動提案）。
export default function AddTraineeButton({ templates }: { templates: TemplateOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [oneRms, setOneRms] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const template = templates.find(t => t.id === templateId)
  const keyOf = (e: TemplateOption['oneRmExercises'][number]) => e.exerciseMasterId ?? e.trainerExerciseId ?? ''

  const reset = () => {
    setName('')
    setTemplateId('')
    setOneRms({})
    setError(null)
    setIssued(null)
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    if (issued) router.refresh()
    reset()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    const payload = []
    for (const ex of template.oneRmExercises) {
      const raw = oneRms[keyOf(ex)]?.trim()
      if (!raw) continue
      const kg = parseFloat(raw)
      if (!Number.isFinite(kg) || kg <= 0 || kg > 500) {
        setError(`${ex.name} の1RMを正しく入力してください`)
        return
      }
      payload.push({ exercise_master_id: ex.exerciseMasterId, trainer_exercise_id: ex.trainerExerciseId, one_rm_kg: kg })
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/trainees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name, template_id: template.id, one_rms: payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'トレーニーの追加に失敗しました')
      setIssued(data as Issued)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'トレーニーの追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium">
        <Plus className="w-4 h-4" />
        追加
      </button>

      {open && (
        // 上揃え: 入力 → 招待コードの表示で高さが変わっても上端（見出し）の位置を動かさない
        <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[10vh] pb-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60" onClick={close} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">トレーニーを追加</p>

            {issued ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{name} さんの招待コードを発行しました。</p>
                <div className="flex items-center gap-3">
                  <p className="text-3xl font-bold tracking-[0.2em] tabular-nums text-black dark:text-white">{issued.code}</p>
                  <button onClick={() => copy(issued.code)} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {new Date(issued.expires_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} まで（7日間）有効です。
                  トレーニーに伝えて、Auxlog で入力してもらってください。一覧からいつでも確認・再発行できます。
                </p>
                <button onClick={close} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white">閉じる</button>
              </div>
            ) : templates.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">共有するプログラムがまだありません。先にプログラムのテンプレートを作成してください。</p>
                <Link href="/trainer/programs" className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">プログラムを作る</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <input
                  required
                  maxLength={40}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="トレーニーの名前"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
                />
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                  <span>共有するプログラム</span>
                  <select
                    required
                    value={templateId}
                    onChange={e => { setTemplateId(e.target.value); setOneRms({}) }}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white"
                  >
                    <option value="" disabled>選択してください</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                {template && template.oneRmExercises.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      1RM（任意）: 入力すると %1RM のセットに重量が入ります。空欄の種目は前回の記録から重量を提案します。
                    </p>
                    {template.oneRmExercises.map(ex => (
                      <label key={keyOf(ex)} className="flex items-center gap-2 text-sm text-black dark:text-white">
                        <span className="flex-1 truncate">{ex.name}</span>
                        <input
                          inputMode="decimal"
                          value={oneRms[keyOf(ex)] ?? ''}
                          onChange={e => setOneRms(prev => ({ ...prev, [keyOf(ex)]: e.target.value }))}
                          placeholder="100"
                          className="w-20 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm tabular-nums"
                        />
                        <span className="text-xs text-zinc-400">kg</span>
                      </label>
                    ))}
                  </div>
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={close} disabled={busy} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white">キャンセル</button>
                  <button type="submit" disabled={busy || !name.trim() || !template} className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
                    {busy ? '発行中...' : '招待コードを発行'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
