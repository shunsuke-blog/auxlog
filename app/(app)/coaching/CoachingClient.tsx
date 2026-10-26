'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ChevronRight, Plus, Trash2, Undo2 } from 'lucide-react'
import SlotExerciseModal from './SlotExerciseModal'
import AddCustomSlotModal from './AddCustomSlotModal'
import { PRIORITY_MUSCLE_OPTION_LABELS, type PriorityMuscleOption } from '@/types'
import { PHASE_STYLE } from '@/lib/coaching/phase_style'
import type { WeekPhaseCode } from '@/lib/coaching/week_phases'

const WeightProgressChart = dynamic(() => import('./WeightProgressChart'), { ssr: false })

type Phase = 'volume' | 'intensity' | 'deload' | 'maxout'

function getPhase(week: number): Phase {
  if (week <= 4) return 'volume'
  if (week <= 7) return 'intensity'
  if (week === 8) return 'deload'
  return 'maxout'
}

const PHASE_CONFIG: Record<Phase, {
  description: string
  focus: string[]
  /** 色は lib/coaching/phase_style.ts（トレーナーのプランの画面と共通） */
  style: (typeof PHASE_STYLE)[WeekPhaseCode]
}> = {
  volume: {
    style: PHASE_STYLE.V,
    description: '筋肉に刺激を積み上げる期間。セット数を週ごとに増やし、適応の土台を作ります。',
    focus: [
      'セット数が多い週。最後まで丁寧に',
      '重量より回数の質を優先',
      '毎セット同じフォームを心がける',
    ],
  },
  intensity: {
    style: PHASE_STYLE.I,
    description: 'ここからが本番。セット数を絞り、より重い重量で体を限界まで追い込みます。',
    focus: [
      'メインセットは決めた重量から逃げない',
      '残りのセットは少し重量を落として丁寧に',
      'セット間の休息は3分以上取る',
    ],
  },
  deload: {
    style: PHASE_STYLE.D,
    // W8 は重量を保ってセット数と努力度を下げる週（2026-10-24 決定）。アプリの phase-config.ts と同じ文言
    description: '疲労を抜き、次の全力に備える大切な週。重量は維持したまま、セット数を減らして負荷をコントロールします。',
    focus: [
      '重量はそのまま、セット数だけ減らして調整',
      '体をリセットする週と割り切る',
      '睡眠・栄養を意識して回復を最大化',
    ],
  },
  maxout: {
    style: PHASE_STYLE.M,
    description: '9週間の集大成。できる限り多くの回数をこなし、次のプログラムの基準重量を更新します。',
    focus: [
      '9週間の積み上げを全て出し切る',
      '全力でできる限り多くの回数に挑戦する',
      'ここで出した回数が次のプログラムの基準になる',
    ],
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
  slots: {
    slotId: string
    label: string
    exerciseName: string
    oneRm?: number
    options: string[]
    // 「この種目を外す」でプログラム期間中ずっと非表示にした種目。タップで再有効化する
    isHidden?: boolean
    // 種目情報から追加したカスタムスロット（slotId は user_custom_slots.id）。タップで削除する
    isCustom?: boolean
  }[]
}

type ConfirmDialog = { title: string; body: string; actionLabel: string; onConfirm: () => Promise<void> }

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
    priorityMuscles: PriorityMuscleOption[]
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
  const [addingSlotDay, setAddingSlotDay] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null)
  const [confirming, setConfirming] = useState(false)

  const { id: enrollmentId, currentWeek, daysPerWeek, sessionDurationMinutes, startedAt, priorityMuscles } = enrollment

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

  const setSlotHidden = async (slotId: string, isHidden: boolean) => {
    const res = await fetch(`/api/program/slot-assignments/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollmentId, is_hidden: isHidden }),
    })
    if (!res.ok) throw new Error('更新に失敗しました')
  }

  const handleSkipSlot = () => {
    if (!editingSlot) return
    const slot = editingSlot
    setConfirm({
      title: `「${slot.exerciseName}」を外しますか？`,
      body: '今後このプログラム期間中、ホーム画面に表示しなくなります。トレーニング記録は削除されません。',
      actionLabel: '外す',
      onConfirm: async () => {
        await setSlotHidden(slot.slotId, true)
        setEditingSlot(null)
      },
    })
  }

  const handleUnhideSlot = async (slotId: string) => {
    // 通信断等で失敗した場合は表示をそのままにする
    await setSlotHidden(slotId, false).then(() => router.refresh()).catch(() => {})
  }

  const handleDeleteCustomSlot = (slot: { slotId: string; exerciseName: string }) => {
    setConfirm({
      title: `「${slot.exerciseName}」を削除しますか？`,
      body: 'この種目をプログラムから外します。トレーニング記録は削除されません。',
      actionLabel: '削除する',
      onConfirm: async () => {
        const res = await fetch(`/api/program/custom-slots/${slot.slotId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('削除に失敗しました')
      },
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirming(true)
    try {
      await confirm.onConfirm()
      router.refresh()
    } catch {
      // 通信断等で失敗した場合は表示をそのままにする
    } finally {
      setConfirming(false)
      setConfirm(null)
    }
  }

  const phase = getPhase(currentWeek)
  const config = PHASE_CONFIG[phase]
  const progressPct = Math.round((currentWeek / 9) * 100)

  // session_duration_minutes(60/75/90)はオンボーディングの帯選択肢
  // （〜60分・60〜90分・90分〜）の内部代表値。単位「分」の実数値ではないため
  // そのまま表示せず、選択された帯のラベルに変換する。
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
      <div className="sticky top-0 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-900 z-20">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-black dark:text-white">プログラム</h1>
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
              <h2 className="text-base font-bold text-black dark:text-white mb-4">9週間ボリューム＆強度プログラム</h2>

              {/* Phase badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-5 ${config.style.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.style.dot} ${phase === 'maxout' ? 'animate-pulse' : ''}`} />
                {config.style.name}
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-black dark:text-white">Week {currentWeek} / 9</span>
                  <span className="text-xs text-zinc-400">{progressPct}%</span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full w-full rounded-full origin-left transition-transform duration-700 ease-out ${config.style.bar}`}
                    style={{ transform: `scaleX(${progressWidth / 100})` }}
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
                {/* 優先部位は種目構成・Day配分そのものに関わり、現在の割り当て
                    (user_slot_assignments)を作り直さない限り安全に変更できないため、
                    ここでは表示のみ（変更はプログラムのリセットから）。
                    2026-07-08、設定画面の編集UIは削除しこちらに移設 */}
                <div>
                  <p className="text-[10px] text-zinc-400 mb-0.5">優先部位</p>
                  <p className="text-sm font-semibold text-black dark:text-white">
                    {priorityMuscles.length > 0
                      ? priorityMuscles.map(m => PRIORITY_MUSCLE_OPTION_LABELS[m]).join('・')
                      : '全身くまなく'}
                  </p>
                </div>
              </div>
            </div>

            {/* 9-week timeline */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h3 className="text-xs font-semibold text-zinc-400  mb-3">9週間スケジュール</h3>
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
                      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-lg transition-colors ${
                        isCurrent
                          ? `${wConfig.style.badge} ring-1 ring-current`
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
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_CONFIG[WEEK_PHASE[selectedWeek]].style.badge}`}>
                      {PHASE_CONFIG[WEEK_PHASE[selectedWeek]].style.name}
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
              <h3 className="text-xs font-semibold text-zinc-400  mb-3">今週のフォーカス</h3>
              <ul className="space-y-2.5">
                {config.focus.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.style.dot}`} />
                    <span className="text-sm text-black dark:text-white leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weight progress chart */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
              <h3 className="text-xs font-semibold text-zinc-400  mb-0.5">使用重量の推移</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mb-3">W8（Deload）は重量を保ったまま、セット数を減らして回復します</p>
              <WeightProgressChart exercises={weightHistory} currentWeek={currentWeek} />
            </div>
          </>
        ) : (
          <>
            {dayData.map(({ day, slots }) => (
              <div key={day} className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
                <h2 className="text-xs font-semibold text-zinc-400  mb-3">Day {day}</h2>
                <div className="space-y-2.5">
                  {slots.map(slot => (
                    <button
                      key={slot.slotId}
                      onClick={() => {
                        if (slot.isHidden) {
                          handleUnhideSlot(slot.slotId)
                          return
                        }
                        if (slot.isCustom) {
                          handleDeleteCustomSlot(slot)
                          return
                        }
                        setSlotError(null)
                        setEditingSlot({
                          slotId: slot.slotId, label: slot.label, exerciseName: slot.exerciseName, options: slot.options,
                        })
                      }}
                      className={`w-full flex items-center justify-between text-left -mx-1 px-1 py-0.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${slot.isHidden ? 'opacity-50' : ''}`}
                    >
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-black dark:text-white">{slot.exerciseName}</p>
                          {slot.isHidden
                            ? <Undo2 className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                            : slot.isCustom
                              ? <Trash2 className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                              : <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />}
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          {slot.isHidden ? `${slot.label}（無効・タップで戻す）` : slot.isCustom ? `${slot.label}（追加）` : slot.label}
                        </p>
                      </div>
                      {slot.oneRm != null && (
                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                          1RM {slot.oneRm}kg
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => setAddingSlotDay(day)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    種目を追加
                  </button>
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
          onSkip={handleSkipSlot}
          onClose={() => { setEditingSlot(null); setSlotError(null) }}
        />
      )}

      {addingSlotDay !== null && (
        <AddCustomSlotModal
          day={addingSlotDay}
          onAdded={() => router.refresh()}
          onClose={() => setAddingSlotDay(null)}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={confirming ? undefined : () => setConfirm(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">{confirm.title}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{confirm.body}</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirm(null)}
                disabled={confirming}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={runConfirm}
                disabled={confirming}
                className="flex-1 py-3 rounded-xl bg-red-500 text-sm font-medium text-white disabled:opacity-50"
              >
                {confirm.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
