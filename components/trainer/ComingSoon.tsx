// 中身をこれから詰めるタブの仮表示（2026-10-19、ロードマップ④の枠組みだけ先に作った）。
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-4 md:px-6 py-3 md:py-5">
        <h1 className="text-xl font-semibold text-black dark:text-white">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <p className="text-base font-semibold text-black dark:text-white">準備中です</p>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">この画面は現在準備中です。</p>
      </div>
    </div>
  )
}
