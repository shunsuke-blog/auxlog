'use client'

type Props = {
  onClose: () => void
  onConfirm: () => void
}

export default function PendingSetsModal({ onClose, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
        <p className="text-base font-semibold text-black dark:text-white">未実施のセットがあります</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          チェックが入っていないセットは保存されません。このまま保存しますか？
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white"
          >
            戻る
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-sm font-medium text-white dark:text-black"
          >
            このまま保存
          </button>
        </div>
      </div>
    </div>
  )
}
