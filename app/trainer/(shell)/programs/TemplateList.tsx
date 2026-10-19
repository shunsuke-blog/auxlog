'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { MAX_PRIORITY_MUSCLES, PRIORITY_MUSCLE_OPTION_LABELS, PRIORITY_MUSCLE_OPTION_ORDER, type PriorityMuscleOption } from '@/types'

// セッション時間はオンボーディングと同じ帯の選択肢（60/75/90 は帯の内部代表値）
const SESSION_OPTIONS = [
  { value: 60, label: '〜60分' },
  { value: 75, label: '60〜90分' },
  { value: 90, label: '90分〜' },
] as const

export type TemplateSummary = {
  id: string
  name: string
  totalWeeks: number
  daysPerWeek: number
  traineeCount: number
  updatedAt: string
}

async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? '操作に失敗しました')
  return data as { id?: string }
}

export default function TemplateList({ templates }: { templates: TemplateSummary[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<'auxlog' | 'blank'>('auxlog')
  const [name, setName] = useState('')
  const [weeks, setWeeks] = useState(9)
  const [days, setDays] = useState(3)
  const [sessionMinutes, setSessionMinutes] = useState<60 | 75 | 90>(75)
  const [priorities, setPriorities] = useState<PriorityMuscleOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const { id } = mode === 'auxlog'
        ? await postJson('/api/trainer/templates/generate', {
            name, total_weeks: weeks, days_per_week: days, session_minutes: sessionMinutes, priority_muscles: priorities,
          })
        : await postJson('/api/trainer/templates', { name, total_weeks: weeks, days_per_week: days })
      router.push(`/trainer/programs/${id}`)
    })
  }

  const handleDuplicate = (t: TemplateSummary) =>
    run(async () => {
      await postJson(`/api/trainer/templates/${t.id}/duplicate`, { name: `${t.name}（コピー）`.slice(0, 60) })
      router.refresh()
    })

  const handleDelete = (t: TemplateSummary) => {
    const note = t.traineeCount > 0 ? '\n共有済みのトレーニーのプランはそのまま残ります。' : ''
    if (!window.confirm(`「${t.name}」を削除しますか？${note}`)) return
    run(async () => {
      await postJson(`/api/trainer/templates/${t.id}`, {}, 'DELETE')
      router.refresh()
    })
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-white">プログラム</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新しく作る
        </button>
      </div>

      <div className="px-6 py-6 space-y-3 max-w-3xl">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {templates.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-16">
            テンプレートはまだありません。「新しく作る」から作成してください。
          </p>
        ) : (
          templates.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <Link href={`/trainer/programs/${t.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-black dark:text-white truncate">{t.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {t.totalWeeks}週間 · 週{t.daysPerWeek}日 · 使用中のトレーニー {t.traineeCount}人
                </p>
              </Link>
              <button onClick={() => handleDuplicate(t)} disabled={busy} title="複製" className="p-2 text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-50">
                <Copy className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(t)} disabled={busy} title="削除" className="p-2 text-zinc-400 hover:text-red-500 disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
              </button>
              <Link href={`/trainer/programs/${t.id}`} className="p-1 text-zinc-300 dark:text-zinc-700">
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ))
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : () => setCreating(false)} />
          <form onSubmit={handleCreate} className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">新しいテンプレート</p>

            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
              {([['auxlog', 'Auxlog で作成'], ['blank', '白紙から作成']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    // Auxlog で作成は週2〜7日（週1日は白紙からのみ）
                    if (m === 'auxlog' && days < 2) setDays(2)
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg ${
                    mode === m ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {m === 'auxlog' && <Sparkles className="w-3.5 h-3.5" />}
                  {label}
                </button>
              ))}
            </div>
            {mode === 'auxlog' && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Auxlog の9週間プログラムと同じ考え方で、週数・日数に合わせて種目・%1RM・回数を自動で組みます。作成後に自由に編集できます。
              </p>
            )}

            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="テンプレート名（例：初心者向け 週3日）"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
            />
            <div className="flex gap-3">
              <label className="flex-1 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                <span>週数</span>
                <select value={weeks} onChange={e => setWeeks(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white">
                  {Array.from({ length: 16 }, (_, i) => i + 1).map(w => <option key={w} value={w}>{w}週間</option>)}
                </select>
              </label>
              <label className="flex-1 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                <span>週の日数</span>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white">
                  {Array.from({ length: 7 }, (_, i) => i + 1)
                    .filter(d => mode === 'blank' || d >= 2)
                    .map(d => <option key={d} value={d}>週{d}日</option>)}
                </select>
              </label>
            </div>
            {mode === 'auxlog' && (
              <>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">1回のトレーニング時間</p>
                  <div className="flex gap-2">
                    {SESSION_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setSessionMinutes(o.value)}
                        className={`flex-1 py-2 rounded-lg border text-sm ${sessionMinutes === o.value ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black' : 'border-zinc-200 dark:border-zinc-800 text-black dark:text-white'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">重点部位（最大{MAX_PRIORITY_MUSCLES}つ・任意）</p>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITY_MUSCLE_OPTION_ORDER.map(m => {
                      const selected = priorities.includes(m)
                      const disabled = !selected && priorities.length >= MAX_PRIORITY_MUSCLES
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={disabled}
                          onClick={() => setPriorities(prev => (selected ? prev.filter(p => p !== m) : [...prev, m]))}
                          className={`px-3 py-1.5 rounded-full border text-sm disabled:opacity-40 ${selected ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black' : 'border-zinc-200 dark:border-zinc-800 text-black dark:text-white'}`}
                        >
                          {PRIORITY_MUSCLE_OPTION_LABELS[m]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setCreating(false)} disabled={busy} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white">
                キャンセル
              </button>
              <button type="submit" disabled={busy || !name.trim()} className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-50">
                {busy ? '作成中...' : '作成'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
