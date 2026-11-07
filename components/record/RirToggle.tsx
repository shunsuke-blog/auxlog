'use client'

type Props = {
  value: boolean
  onChange: (value: boolean) => void
}

// 「余裕」はふつうの状態なので色を付けず、「限界」だけを赤にする（hallmark の audit 2026-11-07、アプリと同じ）
export default function RirToggle({ value, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        value
          ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white'
          : 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
      }`}
    >
      {value ? '余裕' : '限界'}
    </button>
  )
}
