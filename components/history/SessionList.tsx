import Link from 'next/link'
import { Pencil } from 'lucide-react'
import type { UserExercise, TrainingSet } from '@/types'

type Session = {
  id: string
  trained_at: string
  fatigue_level: number
  memo: string | null
  total_volume: number
  sets: TrainingSet[]
}

type Props = {
  sessions: Session[]
  exercises: UserExercise[]
}

export default function SessionList({ sessions, exercises }: Props) {
  const exerciseMap = new Map(exercises.map(e => [e.id, e]))

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-400 dark:text-zinc-600">
        まだ記録がありません
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map(session => {
        const exerciseIds = [...new Set(session.sets.map(s => s.exercise_id))]
        const date = new Date(session.trained_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          weekday: 'short',
        })

        return (
          <div
            key={session.id}
            className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-black dark:text-white">{date}</span>
                <span className="text-xs text-zinc-400">疲労度 {session.fatigue_level}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">
                  {session.total_volume.toLocaleString()}kg
                </span>
                <Link
                  href={`/record/edit/${session.id}`}
                  className="p-1.5 text-zinc-300 dark:text-zinc-700 hover:text-black dark:hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="space-y-1.5">
              {exerciseIds.map(exId => {
                const exercise = exerciseMap.get(exId)
                const exSets = session.sets.filter(s => s.exercise_id === exId)
                if (exSets.length === 0) return null

                const name = exercise?.name ?? '不明な種目'
                const maxWeight = Math.max(...exSets.map(s => s.weight_kg))

                return (
                  <div key={exId} className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{name}</span>
                    <span className="text-xs text-zinc-500">
                      {maxWeight}kg × {exSets[0].reps}回 × {exSets.length}セット
                    </span>
                  </div>
                )
              })}
            </div>

            {session.memo && (
              <p className="mt-2.5 text-xs text-zinc-400 dark:text-zinc-600 border-t border-zinc-100 dark:border-zinc-900 pt-2.5">
                {session.memo}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
