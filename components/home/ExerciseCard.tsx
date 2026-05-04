import Link from 'next/link'
import type { Suggestion } from '@/types'
import { TARGET_MUSCLE_LABELS } from '@/types'
import { AlertTriangle, TrendingDown, ChevronRight } from 'lucide-react'

type Props = {
  suggestion: Suggestion
}

export default function ExerciseCard({ suggestion }: Props) {
  const { exercise, proposed_weight_kg, proposed_sets, proposed_reps, reason, days_since_last, volume_status } = suggestion

  const dayLabel = days_since_last >= 999 ? '初回' : `${days_since_last}日ぶり`

  return (
    <Link
      href={`/record?exerciseId=${exercise.id}`}
      className="block px-6 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-black dark:text-white">
            {exercise.name}
          </h3>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {TARGET_MUSCLE_LABELS[exercise.target_muscle]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-full">
            {dayLabel}
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
        </div>
      </div>

      <div className="text-2xl font-semibold tracking-tight text-black dark:text-white mb-1.5">
        {proposed_weight_kg > 0 ? `${proposed_weight_kg}kg` : '—'}{' '}
        <span className="text-base font-normal text-zinc-500">
          × {proposed_reps}回 × {proposed_sets}セット
        </span>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">{reason}</p>

      {volume_status === 'low' && (
        <div className="flex items-center gap-1.5 text-accent text-xs">
          <TrendingDown className="w-3.5 h-3.5" />
          ボリューム不足（週10セット未満）
        </div>
      )}
      {volume_status === 'high' && (
        <div className="flex items-center gap-1.5 text-red-500 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          オーバートレーニング注意（週20セット超）
        </div>
      )}
    </Link>
  )
}
