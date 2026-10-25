// その Day の進み具合のバー（2026-10-25 オーナー決定: 種目をこなすごとにティールで満たされていく＝目標勾配効果）。
// ホームの Day の切り替えのすぐ下に出す。セルフモード（ProgramDayView）とコーチングモード（CoachingHome）で共通
export default function DayProgress({ day, done, total }: { day: number; done: number; total: number }) {
  if (total <= 0) return null
  const pct = Math.min(100, Math.round((done / total) * 100))
  const complete = done >= total
  return (
    <div className="px-5 pt-2 pb-1 space-y-1.5" aria-label={`Day ${day} の進み具合 ${done} / ${total} 種目`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          Day {day} {complete ? 'コンプリート！' : 'の進み具合'}
        </p>
        <p className={`text-[11px] font-semibold tabular-nums ${complete ? 'text-brand-text' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {done} / {total} 種目
        </p>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
