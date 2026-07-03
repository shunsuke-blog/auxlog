'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronRight } from 'lucide-react'
import SlotExerciseModal from './SlotExerciseModal'

const WeightProgressChart = dynamic(() => import('./WeightProgressChart'), { ssr: false })

type Phase = 'volume' | 'intensity' | 'deload' | 'maxout'

function getPhase(week: number): Phase {
  if (week <= 4) return 'volume'
  if (week <= 7) return 'intensity'
  if (week === 8) return 'deload'
  return 'maxout'
}

const PHASE_CONFIG: Record<Phase, {
  label: string
  description: string
  focus: string[]
  badgeClass: string
  barClass: string
  dotClass: string
}> = {
  volume: {
    label: 'Volume Phase',
    description: '筋肉に刺激を積み上げる期間。セット数を週ごとに増やし、適応の土台を作ります。',
    focus: [
      'セット数が多い週。最後まで丁寧に',
      '重量より回数の質を優先',
      '毎セット同じフォームを心がける',
    ],
    badgeClass: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    barClass: 'bg-blue-500',
    dotClass: 'bg-blue-500',
  },
  intensity: {
    label: 'Intensity Phase',
    description: 'ここからが本番。セット数を絞り、より重い重量で体を限界まで追い込みます。',
    focus: [
      'メインセットは決めた重量から逃げない',
      '残りのセットは少し重量を落として丁寧に',
      'セット間の休息は3分以上取る',
    ],
    badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-500',
  },
  deload: {
    label: 'Deload Week',
    description: '疲労を抜き、次の全力に備える大切な週。重量を落とすほど強くなります。',
    focus: [
      '重量はいつもの60%で十分',
      '体をリセットする週と割り切る',
      '睡眠・栄養を意識して回復を最大化',
    ],
    badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
  },
  maxout: {
    label: 'MaxOut Week',
    description: '9週間の集大成。できる限り多くの回数をこなし、次のプログラムの基準重量を更新します。',
    focus: [
      '9週間の積み上げを全て出し切る',
      '全力でできる限り多くの回数に挑戦する',
      'ここで出した回数が次のプログラムの基準になる',
    ],
    badgeClass: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    barClass: 'bg-red-500',
    dotClass: 'bg-red-500',
  },
}

const WEEK_PHASE: Record<number, Phase> = {
  1: 'volume', 2: 'volume', 3: 'volume', 4: 'volume',
  5: 'intensity', 6: 'intensity', 7: 'intensity',
  8: 'deload',
  9: 'maxout',
}

const WEEK_DETAIL: Record<number, { sets: string; intensity: string; purpose: string }> = {
  1: { sets: '3セット', intensity: '中程度', purpose: 'ボリュームの基礎を作る' },
  2: { sets: '3セット', intensity: '中程度', purpose: '刺激に慣れる' },
  3: { sets: '4セット', intensity: '中程度', purpose: '適応を促進する' },
  4: { sets: '4セット', intensity: '中程度', purpose: 'ボリューム最大化' },
  5: { sets: '3セット（絞る）', intensity: '高い', purpose: '強度への切り替え' },
  6: { sets: '3セット', intensity: 'より高い', purpose: '重さへの適応をさらに高める' },
  7: { sets: '3セット', intensity: 'ピーク', purpose: '最大強度で刺激する' },
  8: { sets: '2セット', intensity: '低め', purpose: '疲労除去・回復' },
  9: { sets: '全力の回数', intensity: '全力', purpose: '最高重量の更新・成果測定' },
}

const WEEK_LABELS = ['Vol', 'Vol', 'Vol', 'Vol', 'Int', 'Int', 'Int', 'Dld', 'Max']

export type DayData = {
  day: number
  slots: { slotId: string; label: string; exerciseName: string; oneRm?: number; options: string[] }[]
  extras: { id: string; name: string; muscleLabel: string | null }[]
}

export type WeightHistory = {
  slotId: string
  exerciseName: string
  data: { week: number; maxWeight: number }[]
}

type Props = {
  enrollment: {
    id: string
    currentWeek: number
    daysPerWeek: number
    sessionDurationMinutes: number | null
    startedAt: string | null
  }
  dayData: DayData[]
  weightHistory: WeightHistory[]
}

export default function CoachingClient({ enrollment, dayData, weightHistory }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'program' | 'exercises'>('program')
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [progressWidth, setProgressWidth] = useState(0)
  const [editingSlot, setEditingSlot] = useState<{ slotId: string; label: string; exerciseName: string; options: string[] } | null>(null)
  const [savingSlot, setSavingSlot] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)

  const { id: enrollmentId, currentWeek, daysPerWeek, sessionDurationMinutes, startedAt } = enrollment

  const handleSelectExercise = async (exerciseName: string) => {
    if (!editingSlot) return
    setSavingSlot(true)
    setSlotError(null)
    try {
      const res = await fetch(`/api/program/slot-assignments/${editingSlot.slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId, exercise_name: exerciseName }),
      })
      if (res.ok) {
        setEditingSlot(null)
        router.refresh()
      } else {
        const data = await res.json().catch(() => null)
        setSlotError(data?.error ?? '種目の変更に失敗しました。もう一度お試しください')
      }
    } catch {
      setSlotError('種目の変更に失敗しました。もう一度お試しください')
    } finally {
      setSavingSlot(false)
    }
  }
  const phase = getPhase(currentWeek)
  const config = PHASE_CONFIG[phase]
  const progressPct = Math.round((currentWeek / 9) * 100)

  const sessionLabel = sessionDurationMinutes === 60 ? '〜60分'
    : sessionDurationMinutes === 75 ? '60〜90分'
    : sessionDurationMinutes != null ? '90分〜'
    : null

  useEffect(() => {
    const timer = setTimeout(() => setProgressWidth(progressPct), 120)
    return () => clearTimeout(timer)
  }, [progressPct])

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Sticky header */}
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 z-20">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-black dark:text-white">コーチング</h1>
        </div>
        <div className="px-6 pb-3">
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
            <button
              onClick={() => setView('program')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                view === 'program'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              プログラム情報
            </button>
            <button
              onClick={() => setView('exercises')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                view === 'exercises'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              種目情報
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        {view === 'program' ? (
          <>
            {/* Hero Card */}
            <div className="px-5 py-5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">9週間ステップアップ計画</p>
              <h2 className="text-base font-bold text-black dark:text-white mb-4">9週間ボリューム＆強度プログラム</h2>

              {/* Phase badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-5 ${config.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass} ${phase === 'maxout' ? 'animate-pulse' : ''}`} />
                {config.label}
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-black dark:text-white">Week {currentWeek} / 9</span>
                  <span className="text-xs text-zinc-400">{progressPct}%</span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${config.barClass}`}
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
                {config.description}
              </p>

              {/* Stats row */}
              <div className="flex gap-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="text-[10px] text-zinc-400 mb-0.5">頻度</p>
                  <p className="text-sm font-semibold text-black dark:text-white">週{daysPerWeek}回</p>
                </div>
                {sessionLabel && (
                  <div>
                    <p className="text-[10px] text-zinc-400 mb-0.5">セッション</p>
                    <p className="text-sm font-semibold text-black dark:text-white">{sessionLabel}</p>
                  </div>
                )}
                {startedAt && (
                  <div>
                    <p className="text-[10px] text-zinc-400 mb-0.5">開始日</p>
                    <p className="text-sm font-semibold text-black dark:text-white">
                      {new Date(startedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 9-week timeline */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">9週間スケジュール</h3>
              <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8,9].map((week, i) => {
                  const wPhase = WEEK_PHASE[week]
                  const wConfig = PHASE_CONFIG[wPhase]
                  const isPast = week < currentWeek
                  const isCurrent = week === currentWeek
                  const isFuture = week > currentWeek
                  const isSelected = selectedWeek === week
                  return (
                    <button
                      key={week}
                      onClick={() => setSelectedWeek(isSelected ? null : week)}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-lg transition-all ${
                        isCurrent
                          ? `${wConfig.badgeClass} ring-1 ring-current`
                          : isSelected
                            ? 'bg-zinc-800 dark:bg-zinc-200 ring-1 ring-zinc-800 dark:ring-zinc-200'
                            : isPast
                              ? 'bg-zinc-50 dark:bg-zinc-900'
                              : 'bg-zinc-50/50 dark:bg-zinc-900/50'
                      }`}
                    >
                      <span className={`text-[11px] font-bold tabular-nums ${
                        isCurrent ? ''
                        : isSelected ? 'text-white dark:text-zinc-900'
                        : isFuture ? 'text-zinc-300 dark:text-zinc-700'
                        : 'text-zinc-500 dark:text-zinc-400'
                      }`}>
                        {week}
                      </span>
                      <span className={`text-[8px] ${
                        isCurrent ? 'opacity-70'
                        : isSelected ? 'text-white/70 dark:text-zinc-600'
                        : isFuture ? 'text-zinc-300 dark:text-zinc-700'
                        : 'text-zinc-400'
                      }`}>
                        {WEEK_LABELS[i]}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Week detail popup */}
              {selectedWeek !== null && (
                <div className="mt-3 p-3.5 bg-zinc-50 dark:bg-zinc-900 rounded-xl">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-semibold text-black dark:text-white">Week {selectedWeek}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_CONFIG[WEEK_PHASE[selectedWeek]].badgeClass}`}>
                      {PHASE_CONFIG[WEEK_PHASE[selectedWeek]].label}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {([
                      ['セット数', WEEK_DETAIL[selectedWeek].sets],
                      ['強度', WEEK_DETAIL[selectedWeek].intensity],
                      ['目的', WEEK_DETAIL[selectedWeek].purpose],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-zinc-500">{label}</span>
                        <span className="text-black dark:text-white font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Focus points */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">今週のフォーカス</h3>
              <ul className="space-y-2.5">
                {config.focus.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
                    <span className="text-sm text-black dark:text-white leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weight progress chart */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">使用重量の推移</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mb-3">W8（Deload）は回復のため意図的に重量を落とします</p>
              <WeightProgressChart exercises={weightHistory} currentWeek={currentWeek} />
            </div>
          </>
        ) : (
          <>
            {dayData.map(({ day, slots, extras }) => (
              <div key={day} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Day {day}</h2>
                <div className="space-y-2.5">
                  {slots.map(slot => (
                    <button
                      key={slot.slotId}
                      onClick={() => {
                        setSlotError(null)
                        setEditingSlot({
                          slotId: slot.slotId, label: slot.label, exerciseName: slot.exerciseName, options: slot.options,
                        })
                      }}
                      className="w-full flex items-center justify-between text-left -mx-1 px-1 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-black dark:text-white">{slot.exerciseName}</p>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{slot.label}</p>
                      </div>
                      {slot.oneRm != null && (
                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                          1RM {slot.oneRm}kg
                        </span>
                      )}
                    </button>
                  ))}
                  {extras.map(ex => (
                    <div key={ex.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-black dark:text-white">{ex.name}</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          {ex.muscleLabel ? `${ex.muscleLabel}（追加）` : '追加種目'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {editingSlot && (
        <SlotExerciseModal
          label={editingSlot.label}
          currentName={editingSlot.exerciseName}
          options={editingSlot.options}
          saving={savingSlot}
          error={slotError}
          onSelect={handleSelectExercise}
          onClose={() => { setEditingSlot(null); setSlotError(null) }}
        />
      )}
    </div>
  )
}
