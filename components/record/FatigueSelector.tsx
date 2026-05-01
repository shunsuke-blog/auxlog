'use client'

const LABELS: Record<number, string> = {
  1: '最悪',
  2: '',
  3: '普通',
  4: '',
  5: '最高',
}

type Props = {
  value: number
  onChange: (value: number) => void
}

export default function FatigueSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border transition-colors ${
            value === n
              ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
              : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <span className="text-sm font-semibold">{n}</span>
          {LABELS[n] && (
            <span className="text-[9px] mt-0.5 leading-none">{LABELS[n]}</span>
          )}
        </button>
      ))}
    </div>
  )
}
