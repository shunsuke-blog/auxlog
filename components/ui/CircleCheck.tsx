'use client'

import { Check } from 'lucide-react'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  size?: number
}

export default function CircleCheck({ checked, onChange, size = 28 }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{ width: size, height: size }}
      className={`rounded-full flex items-center justify-center transition-colors shrink-0 ${
        checked
          ? 'bg-blue-500'
          : 'bg-zinc-200 dark:bg-zinc-700'
      }`}
    >
      <Check
        strokeWidth={3}
        style={{ width: size * 0.5, height: size * 0.5 }}
        className="text-white"
      />
    </button>
  )
}
