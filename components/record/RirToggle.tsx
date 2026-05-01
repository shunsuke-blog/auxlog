'use client'

type Props = {
  value: boolean
  onChange: (value: boolean) => void
}

export default function RirToggle({ value, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        value
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
      }`}
    >
      {value ? '余裕' : '限界'}
    </button>
  )
}
