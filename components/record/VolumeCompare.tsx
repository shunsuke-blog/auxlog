type Props = {
  /** 前回の総挙上量（kg）か合計回数。前回が無い（初めての種目）は 0 か null */
  prev: number | null | undefined
  now: number
  unit: 'kg' | '回'
}

// 記録中の「前回 412kg　今回 154kg」。記号（▶︎）だけで並べると何と何の比較か分からないので、言葉で書く（hallmark の audit 2026-11-07、アプリと同じ）。
// 前回が無い時は今回だけ
export default function VolumeCompare({ prev, now, unit }: Props) {
  const format = (v: number) => `${Math.round(v).toLocaleString()}${unit}`
  return (
    <span className="ml-auto flex items-baseline gap-3 text-xs tabular-nums shrink-0">
      {!!prev && <span className="text-zinc-400">前回 {format(prev)}</span>}
      <span className="text-black dark:text-white">今回 {format(now)}</span>
    </span>
  )
}
