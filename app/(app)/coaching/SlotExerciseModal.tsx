'use client'

import { X, Check } from 'lucide-react'

type Props = {
  label: string
  currentName: string
  options: string[]
  saving: boolean
  onSelect: (name: string) => void
  onClose: () => void
}

export default function SlotExerciseModal({ label, currentName, options, saving, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-900">
          <div>
            <h2 className="text-base font-semibold text-black dark:text-white">種目を変更</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {options.length <= 1 ? (
            <p className="text-center py-10 text-sm text-zinc-400">このスロットには他の選択肢がありません</p>
          ) : (
            <div className="space-y-2">
              {options.map(name => {
                const isCurrent = name === currentName
                return (
                  <button
                    key={name}
                    disabled={saving}
                    onClick={() => (isCurrent ? onClose() : onSelect(name))}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-left transition-colors disabled:opacity-60 ${
                      isCurrent
                        ? 'border-black dark:border-white bg-black dark:bg-white'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isCurrent ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                      {name}
                    </span>
                    {isCurrent && <Check className="w-4 h-4 text-white dark:text-black" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
