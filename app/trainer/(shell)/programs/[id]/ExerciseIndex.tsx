'use client'

import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'

export type ExerciseOption = { id: string; name: string; targetMuscle: string | null; count: number }

// 種目ごと表示: テンプレートに出てくる種目を部位ごとのカードで並べる（部位の並びは種目一覧と同じ）
export default function ExerciseIndex({ options, activeId, onSelect }: { options: ExerciseOption[]; activeId: string | null; onSelect: (id: string) => void }) {
  const groups = [
    ...MUSCLE_ORDER.map(m => ({ key: m as string, label: TARGET_MUSCLE_LABELS[m], items: options.filter(o => o.targetMuscle === m) })),
    { key: 'other', label: 'その他', items: options.filter(o => !MUSCLE_ORDER.includes(o.targetMuscle as TargetMuscle)) },
  ].filter(g => g.items.length > 0)
  return (
    <>
    {/* スマホ・タブレット（lg未満）は選択欄にする。カードを並べると種目の数だけ縦に伸び、編集欄が下に追いやられるため */}
    <div className="lg:hidden px-4 md:px-6 pt-4 md:pt-6">
      {options.length === 0 ? (
        <p className="text-xs text-zinc-400">まだ種目がありません。Dayごとの表示で種目を追加してください。</p>
      ) : (
        <select
          aria-label="種目を選ぶ"
          value={activeId ?? ''}
          onChange={e => onSelect(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-black"
        >
          {groups.map(g => (
            <optgroup key={g.key} label={g.label}>
              {g.items.map(o => <option key={o.id} value={o.id}>{o.name}（{o.count}回）</option>)}
            </optgroup>
          ))}
        </select>
      )}
    </div>
    <aside className="hidden lg:block lg:p-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-r border-zinc-100 dark:border-zinc-900 lg:bg-zinc-50 lg:dark:bg-zinc-950 space-y-4">
      {options.length === 0 && <p className="text-xs text-zinc-400">まだ種目がありません。Dayごとの表示で種目を追加してください。</p>}
      {groups.map(g => (
        <div key={g.key} className="space-y-1.5">
          <p className="text-[11px] font-semibold text-zinc-400">{g.label}</p>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
            {g.items.map(o => {
              const active = o.id === activeId
              return (
                <button
                  key={o.id}
                  onClick={() => onSelect(o.id)}
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
    </>
  )
}
