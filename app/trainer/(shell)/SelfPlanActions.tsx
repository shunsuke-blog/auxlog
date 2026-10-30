'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, ChevronRight } from 'lucide-react'
import { todayInJapan } from '@/lib/coaching/week_dates'
import { TemplateOneRmFields, useTemplateOneRms, type TemplateOption } from './TemplateOneRmFields'

// 自分の行の詳細の操作（2026-10-26 オーナー決定）: 自分のトレーニー画面を開く・自分に割り当てるプログラムを変える。
// 割り当てると今のプランは終了し、自分のトレーニー画面がコーチングモードになる。外すとセルフモードに戻る。
export default function SelfPlanActions({ templates, hasPlan }: { templates: TemplateOption[]; hasPlan: boolean }) {
  const router = useRouter()
  const picker = useTemplateOneRms()
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(todayInJapan)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    picker.reset()
    setStartDate(todayInJapan())
    setError(null)
  }

  const send = async (init: RequestInit, fallback: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/self-plan', init)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? fallback)
      }
      router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback)
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!picker.templateId) return
    const built = picker.buildPayload()
    if ('error' in built) {
      setError(built.error)
      return
    }
    const ok = await send({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: picker.templateId, one_rms: built.payload, start_date: startDate }),
    }, 'プログラムの割り当てに失敗しました')
    if (ok) {
      setOpen(false)
      picker.reset()
    }
  }

  const endPlan = () => {
    if (!window.confirm('自分のプログラムを外しますか？\n自分のトレーニングはセルフモードに戻ります。これまでの記録は残ります。')) return
    send({ method: 'DELETE' }, 'プログラムの終了に失敗しました')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Cookie を立てるルートなので prefetch しない */}
        <Link
          href="/trainer/self"
          prefetch={false}
          className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand"
        >
          自分のトレーニングを開く
          <ChevronRight className="w-4 h-4" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-black cursor-pointer hover:bg-zinc-50"
        >
          <ArrowRightLeft className="w-4 h-4" />
          {hasPlan ? 'プログラムを変更' : 'プログラムを割り当てる'}
        </button>
      </div>
      {hasPlan && (
        <div className="flex justify-end">
          <button onClick={endPlan} disabled={busy} className="text-sm text-zinc-500 underline hover:text-black disabled:opacity-50">
            プログラムを外してセルフモードに戻る
          </button>
        </div>
      )}
      {error && !open && <p className="text-sm text-red-500">{error}</p>}

      {open && createPortal(
        // AddTraineeButton と同じく body 直下に出し、上揃えで高さが変わっても見出しの位置を動かさない
        <div className="light-only fixed inset-0 z-50 flex items-start justify-center px-6 pt-[10vh] pb-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60" onClick={close} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">{hasPlan ? '自分のプログラムを変更' : '自分にプログラムを割り当てる'}</p>
            {templates.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">割り当てるプログラムがまだありません。先にプログラムのテンプレートを作成してください。</p>
                <Link href="/trainer/programs" className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">プログラムを作る</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {hasPlan && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">今のプログラムは終了します。これまでの記録は残ります。</p>
                )}
                <TemplateOneRmFields templates={templates} state={picker} label="割り当てるプログラム" who="自分" />
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                  <span>開始日</span>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white"
                  />
                </label>
                {(error ?? picker.loadError) && <p className="text-sm text-red-500">{error ?? picker.loadError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={close} disabled={busy} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">キャンセル</button>
                  <button type="submit" disabled={busy || picker.loading || !picker.templateId || !startDate} className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
                    {busy ? '割り当て中…' : '割り当てる'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
