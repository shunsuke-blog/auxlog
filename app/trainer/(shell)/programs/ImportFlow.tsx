'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Undo2 } from 'lucide-react'
import TemplateEditor from './[id]/TemplateEditor'
import ExercisePicker from './[id]/ExercisePicker'
import type { MenuImportResponse } from './ImportInput'
import { PLAN_MUSCLE_GROUPS, exerciseIdOf, type CatalogExercise } from '@/lib/trainer/templateEditor'
import {
  MAX_IMPORT_DAYS, MAX_IMPORT_WEEKS, buildDraft, fitsTemplate, sourceExercises,
  type ImportDraft, type Resolutions,
} from '@/lib/trainer/menuImport'

type Step = 'confirm' | 'draft'

// メニューの表の取り込みの続き（2026-10-28）。「表から取り込む」タブで読み取った結果を確かめて（種目の対応）、
// 下書きを編集して保存する。表が大きいので、テンプレートの一覧の代わりに画面いっぱいに出す
export default function ImportFlow({ result, fileName, onClose }: { result: MenuImportResponse; fileName: string | null; onClose: () => void }) {
  const [step, setStep] = useState<Step>('confirm')
  const [catalog, setCatalog] = useState(result.catalog)
  // AI が選んだ種目を最初の選択にする（「外す」を戻す時の戻り先）
  const [initialRes] = useState<Resolutions>(() => {
    const byKey = new Map(result.catalog.map(c => [exerciseIdOf(c), c]))
    return Object.fromEntries(sourceExercises(result.days).map(s => [s.sourceName, s.matchKey ? byKey.get(s.matchKey) : undefined]))
  })
  const [resolutions, setResolutions] = useState<Resolutions>(initialRes)
  const [picking, setPicking] = useState<{ sourceName: string; create: boolean } | null>(null)
  const [draft, setDraft] = useState<ImportDraft | null>(null)

  // 確認中に閉じると、読み取った内容が消える（1日の回数も使っている）
  useEffect(() => {
    if (step !== 'confirm') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [step])

  const back = () => {
    if (window.confirm('読み取った内容は消えます。テンプレートの一覧に戻りますか？')) onClose()
  }

  const sources = useMemo(() => sourceExercises(result.days), [result])
  const fitDays = result.days.filter(fitsTemplate)
  const outside = result.days.length - fitDays.length
  const totalWeeks = Math.max(1, ...fitDays.map(d => d.week))
  const daysPerWeek = Math.max(1, ...fitDays.map(d => d.day))
  const unresolved = sources.filter(s => resolutions[s.sourceName] === undefined).length
  const byName = (name: string) => resolutions[name]

  const resolve = (sourceName: string, to: CatalogExercise | 'skip' | undefined) =>
    setResolutions(prev => ({ ...prev, [sourceName]: to }))

  const startDraft = () => {
    setDraft(buildDraft(result.days, resolutions))
    setStep('draft')
  }

  const defaultName = (fileName?.replace(/\.[^.]+$/, '') || '取り込んだメニュー').slice(0, 60)

  if (step === 'draft' && draft) {
    return <TemplateEditor planId={null} initialName={defaultName} totalWeeks={draft.totalWeeks} days={draft.days} catalog={catalog} onExit={onClose} />
  }

  const header = (
    <div className="sticky top-0 z-10 trainer-header h-14 md:h-[72px] px-4 md:px-6 flex items-center gap-2">
      <button onClick={back} aria-label="テンプレートの一覧に戻る" className="p-1 -ml-1 text-zinc-400 hover:text-black dark:hover:text-white">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <h1 className="text-xl font-semibold text-black dark:text-white">表から取り込む</h1>
      <p className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">内容を確かめる → 下書きを編集</p>
    </div>
  )

  // 種目の対応は、対応できなかった種目 → 部位ごと（胸・背中…・有酸素）→ 取り込まない の順にまとめる（2026-10-28 オーナー依頼）。
  // 部位は今選んでいる種目の部位なので、選び直すとそのまとまりに移る
  const targetOf = (name: string) => { const to = byName(name); return to && to !== 'skip' ? to : null }
  const groupKeys = new Set(PLAN_MUSCLE_GROUPS.map(g => g.key))
  const sourceGroups = [
    { key: 'unresolved', label: '対応できなかった種目', items: sources.filter(s => byName(s.sourceName) === undefined) },
    ...PLAN_MUSCLE_GROUPS.map(g => ({ key: g.key, label: g.label, items: sources.filter(s => targetOf(s.sourceName)?.targetMuscle === g.key) })),
    { key: 'other', label: 'その他', items: sources.filter(s => { const t = targetOf(s.sourceName); return t != null && !groupKeys.has(t.targetMuscle ?? '') }) },
    { key: 'skip', label: '取り込まない', items: sources.filter(s => byName(s.sourceName) === 'skip') },
  ].filter(g => g.items.length > 0)

  const sourceRow = (s: (typeof sources)[number]) => {
    const to = byName(s.sourceName)
    const guessed = to && to !== 'skip' && s.matchKey === exerciseIdOf(to) && s.matchGuessed
    return (
      <div key={s.sourceName} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="md:w-56 shrink-0 min-w-0">
          <p className={`text-sm font-medium truncate ${to === 'skip' ? 'text-zinc-400 line-through' : 'text-black dark:text-white'}`}>{s.sourceName}</p>
          <p className="text-[11px] text-zinc-400">表に{s.count}回</p>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-zinc-300 dark:text-zinc-700">→</span>
          {to === 'skip' ? (
            <span className="text-sm text-zinc-400">取り込まない</span>
          ) : to ? (
            <span className="min-w-0 text-sm text-black dark:text-white truncate">
              {to.name}
              {guessed && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-700 dark:text-amber-400">推測</span>}
            </span>
          ) : (
            <span className="text-sm font-medium text-red-500">一覧に無い種目</span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1 -ml-2 md:ml-0">
          {to === 'skip' ? (
            <button onClick={() => resolve(s.sourceName, initialRes[s.sourceName])} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-black hover:bg-zinc-100">
              <Undo2 className="w-3.5 h-3.5" />戻す
            </button>
          ) : (
            <>
              <button onClick={() => setPicking({ sourceName: s.sourceName, create: false })} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-black hover:bg-zinc-100">
                {to ? '変更' : '選ぶ'}
              </button>
              {!to && (
                <button onClick={() => setPicking({ sourceName: s.sourceName, create: true })} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-black hover:bg-zinc-100">
                  独自の種目を作る
                </button>
              )}
              <button onClick={() => resolve(s.sourceName, 'skip')} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-500 hover:bg-zinc-100">
                外す
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="px-4 md:px-6 py-4 md:py-6 space-y-6 max-w-3xl">
        <div className="space-y-2">
          <p className="text-base font-semibold text-black dark:text-white">{totalWeeks}週間・週{daysPerWeek}日のテンプレートとして取り込みます</p>
          {result.warnings.map((w, i) => <p key={i} className="text-sm text-amber-700 dark:text-amber-400">{w}</p>)}
          {outside > 0 && (
            <p className="text-sm text-red-500">{MAX_IMPORT_WEEKS + 1}週目以降・Day {MAX_IMPORT_DAYS + 1} 以降の {outside}日分は入りません（テンプレートは最大{MAX_IMPORT_WEEKS}週・週{MAX_IMPORT_DAYS}日）。</p>
          )}
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-black dark:text-white">種目の対応</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              表の種目を、どの種目として取り込むか確かめてください。<span className="text-amber-700 dark:text-amber-400">推測</span>は略称や英語名から AI が選んだものです。
            </p>
          </div>
          {sourceGroups.map(g => (
            <div key={g.key} className="space-y-1.5">
              <p className={`text-xs font-semibold ${g.key === 'unresolved' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>{g.label}（{g.items.length}）</p>
              <div className="rounded-2xl trainer-card divide-y divide-zinc-100 dark:divide-zinc-900">
                {g.items.map(sourceRow)}
              </div>
            </div>
          ))}
        </section>

      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 px-4 md:px-6 py-3 bg-white/95 dark:bg-black/95 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-end gap-3">
        <p className={`flex-1 text-xs md:text-sm ${unresolved > 0 ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {unresolved > 0 ? `一覧に無い種目が ${unresolved} つあります。選ぶか、独自の種目を作るか、外してください` : '次の画面で、読み取った重量・回数などを確かめて直してから保存できます'}
        </p>
        <button onClick={startDraft} disabled={unresolved > 0} className="shrink-0 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-40">
          下書きを作る
        </button>
      </div>

      {picking && (
        <ExercisePicker
          catalog={catalog}
          initialQuery={picking.create ? picking.sourceName.slice(0, 60) : undefined}
          onPick={ex => { resolve(picking.sourceName, ex); setPicking(null) }}
          onCreated={ex => { setCatalog(prev => [ex, ...prev]); resolve(picking.sourceName, ex); setPicking(null) }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}
