import Link from 'next/link'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import type { SlotSuggestion, SetSuggestion } from '@/types'

type Props = {
  slot: SlotSuggestion
  is_done?: boolean
}

const SET_TYPE_LABEL: Record<SetSuggestion['set_type'], string> = {
  warmup: 'ウォーム',
  top:    'メイン',
  backoff:'セット',
  working:'セット',
}

const SET_TYPE_CLASS: Record<SetSuggestion['set_type'], string> = {
  warmup: 'text-zinc-400 dark:text-zinc-500',
  top:    'text-black dark:text-white font-bold',
  backoff:'text-zinc-700 dark:text-zinc-300',
  working:'text-zinc-700 dark:text-zinc-300',
}

function repsDisplay(s: SetSuggestion): string {
  if (s.target_reps === 'amrap') return '限界まで'
  if (s.rep_range_min != null && s.rep_range_max != null) {
    return `${s.rep_range_min}〜${s.rep_range_max}回`
  }
  return `${s.target_reps}回`
}

function weightDisplay(s: SetSuggestion): string {
  if (s.suggested_weight_kg === 0) return '—'
  return `${s.suggested_weight_kg}kg`
}

function condenseSets(sets: SetSuggestion[]): Array<{
  type: SetSuggestion['set_type']
  label: string
  weight: string
  reps: string
  count: number
  rpe: number
}> {
  const result: ReturnType<typeof condenseSets> = []

  // warmup sets — show as single collapsed row
  const warmups = sets.filter(s => s.set_type === 'warmup')
  if (warmups.length > 0) {
    const weights = warmups.map(s => `${s.suggested_weight_kg}kg`).join(' · ')
    result.push({
      type: 'warmup',
      label: SET_TYPE_LABEL.warmup,
      weight: weights,
      reps: warmups.map(s => `×${s.target_reps}`).join(' '),
      count: warmups.length,
      rpe: warmups[0].target_rpe,
    })
  }

  // top set — always 1, show individually
  const top = sets.find(s => s.set_type === 'top')
  if (top) {
    result.push({
      type: 'top',
      label: SET_TYPE_LABEL.top,
      weight: weightDisplay(top),
      reps: repsDisplay(top),
      count: 1,
      rpe: top.target_rpe,
    })
  }

  // backoff sets — condense to one row
  const backoffs = sets.filter(s => s.set_type === 'backoff')
  if (backoffs.length > 0) {
    result.push({
      type: 'backoff',
      label: `${backoffs.length}${SET_TYPE_LABEL.backoff}`,
      weight: weightDisplay(backoffs[0]),
      reps: repsDisplay(backoffs[0]),
      count: backoffs.length,
      rpe: backoffs[0].target_rpe,
    })
  }

  // working sets — condense to one row
  const workings = sets.filter(s => s.set_type === 'working')
  if (workings.length > 0) {
    result.push({
      type: 'working',
      label: `${workings.length}${SET_TYPE_LABEL.working}`,
      weight: weightDisplay(workings[0]),
      reps: repsDisplay(workings[0]),
      count: workings.length,
      rpe: workings[0].target_rpe,
    })
  }

  return result
}

export default function ProgramSlotCard({ slot, is_done = false }: Props) {
  const rows = condenseSets(slot.sets)

  const saveSlotToSession = () => {
    try {
      const payload = slot.sets.map((s, i) => ({
        set_number: i + 1,
        weight_kg: s.suggested_weight_kg,
        reps: s.target_reps === 'amrap' ? 1 : s.target_reps,
        is_warmup: s.set_type === 'warmup',
      }))
      sessionStorage.setItem(`auxlog_program_slot_${slot.exercise.id}`, JSON.stringify(payload))
    } catch { /* ignore */ }
  }

  return (
    <Link
      href={`/record?exerciseId=${slot.exercise.id}`}
      onClick={saveSlotToSession}
      className={`block rounded-3xl px-5 pt-4 pb-5 active:scale-[0.99] transition-transform ${
        is_done
          ? 'bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50'
          : 'bg-white dark:bg-zinc-900 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-none border border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
            {slot.slot.muscle_group}
          </p>
          <h3 className={`text-[15px] font-bold leading-snug ${is_done ? 'text-zinc-400 dark:text-zinc-500' : 'text-black dark:text-white'}`}>
            {slot.exercise.name}
          </h3>
        </div>
        {is_done
          ? <CheckCircle2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mt-1 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 mt-1 shrink-0" />
        }
      </div>

      {/* 区切り */}
      <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

      {/* セット一覧 */}
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <span className={`w-14 shrink-0 text-[11px] font-semibold tracking-wide ${SET_TYPE_CLASS[row.type]}`}>
              {row.label}
            </span>
            <span className={`font-medium tabular-nums ${SET_TYPE_CLASS[row.type]}`}>
              {row.weight}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500 tabular-nums">{row.reps}</span>
          </div>
        ))}
      </div>

      {/* notes */}
      {slot.notes && (
        <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl px-3 py-2">
          {slot.notes}
        </p>
      )}
    </Link>
  )
}
