'use client'

import { useState } from 'react'
import { ArrowLeftRight, Search, X } from 'lucide-react'
import { exerciseIdOf, isCardioExercise, muscleGroupLabel, type CatalogExercise } from '@/lib/trainer/templateEditor'

export type SwapScope = 'this' | 'sameDayAllWeeks'

type Props = {
  /** 入れ替える元の種目 */
  current: { name: string; targetMuscle: string | null; movementPattern: string | null; isMaster: boolean; id: string }
  /** 1RM管理の種目（%1RM のセットがある種目）の入れ替えか。その時だけ「1RM管理外」の表示と説明を出す */
  oneRmSource: boolean
  catalog: CatalogExercise[]
  /** その Day にすでにある種目（候補に「この Day にあり」と出す） */
  inDay: Set<string>
  /** 範囲の選択を出すか（Dayごと表示のみ）。dayNumber と totalWeeks は文言用 */
  scope?: { dayNumber: number; totalWeeks: number }
  onPick: (ex: CatalogExercise, scope: SwapScope) => void
  onClose: () => void
}

const keyOf = exerciseIdOf

// 種目の入れ替え（2026-10-25 オーナー依頼）。セット・コメントはそのままで種目だけを替える。
// 候補は「同じ動き」→「同じ部位」→ 検索した時だけその他、の順に出す。
export default function SwapPicker({ current, oneRmSource, catalog, inDay, scope, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<SwapScope>('sameDayAllWeeks')

  const q = query.trim()
  // 有酸素は有酸素同士でだけ入れ替える（目標の持ち方がセットと違うため、2026-10-26）
  const currentIsCardio = isCardioExercise(current)
  const candidates = catalog.filter(e => keyOf(e) !== current.id && isCardioExercise(e) === currentIsCardio && (!q || e.name.includes(q)))
  const sameMovement = current.movementPattern ? candidates.filter(e => e.movementPattern === current.movementPattern) : []
  const sameMuscle = candidates.filter(e => !sameMovement.includes(e) && e.targetMuscle != null && e.targetMuscle === current.targetMuscle)
  const others = q ? candidates.filter(e => !sameMovement.includes(e) && !sameMuscle.includes(e)) : []
  const muscleLabel = muscleGroupLabel(current.targetMuscle)

  const groups: { title: string; items: CatalogExercise[] }[] = [
    { title: '同じ動きの種目', items: sameMovement },
    { title: `同じ部位（${muscleLabel || 'その他'}）の種目`, items: sameMuscle },
    { title: 'その他の種目', items: others },
  ].filter(g => g.items.length > 0)

  return (
    // 上揃え: 検索で候補の数が変わっても、見出しと検索欄の位置を動かさない
    <div className="fixed inset-0 z-50 flex items-center md:items-start justify-center md:px-6 md:pt-[10vh]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full h-full md:h-auto md:max-h-[80vh] md:max-w-lg flex flex-col bg-white dark:bg-black md:rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 space-y-3 border-b border-zinc-100 dark:border-zinc-900">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="w-4 h-4 mt-1 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-black dark:text-white">種目を入れ替え</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{current.name} → 選んだ種目（セット・回数・コメントはそのまま{oneRmSource ? '。「1RM管理外」の種目に替えると、%1RM のセットは重量「自動」になります' : ''}）</p>
            </div>
            <button onClick={onClose} aria-label="閉じる" className="text-zinc-400"><X className="w-5 h-5" /></button>
          </div>

          {scope && (
            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
              {([
                ['sameDayAllWeeks', `全週の Day ${scope.dayNumber}（Week 1〜${scope.totalWeeks}）`],
                ['this', 'この週だけ'],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRange(v)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg ${range === v ? 'bg-white dark:bg-zinc-800 text-brand-text font-semibold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="種目名で検索（部位の違う種目も探せます）"
              className="flex-1 text-sm bg-transparent text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          {groups.length === 0 && <p className="px-5 py-8 text-sm text-zinc-400 text-center">候補がありません</p>}
          {groups.map(g => (
            <div key={g.title}>
              <p className="px-5 pt-3 pb-1 text-xs font-semibold text-zinc-400">{g.title}</p>
              {g.items.map(e => (
                <button
                  key={keyOf(e)}
                  onClick={() => onPick(e, scope ? range : 'this')}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left border-b border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="text-sm text-black dark:text-white">{e.name}</span>
                  <span className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-400">
                    {inDay.has(keyOf(e)) && <span>この Day にあり</span>}
                    {e.trainerExerciseId && <span>独自の種目</span>}
                    {oneRmSource && !e.requiresOneRm && <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-500">1RM管理外</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
