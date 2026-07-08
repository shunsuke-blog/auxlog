'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, Smartphone, Zap, Sliders, Sparkles } from 'lucide-react'
import {
  BASE_CATEGORIES_BY_RANK,
  LEG_DEFAULT_CATEGORY,
  type CompositionCategory,
} from '@/lib/constants/program_composition'
import {
  buildExerciseCategories,
  distributeToDays,
  isOneRmDemotedAtDays,
  type DaysPerWeek,
  type SessionDurationMinutes,
} from '@/lib/suggest/generate_program_composition'
import { PRIORITY_MUSCLE_OPTION_ORDER, PRIORITY_MUSCLE_OPTION_LABELS, MAX_PRIORITY_MUSCLES, type PriorityMuscleOption } from '@/types'

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type ExerciseMasterRow = {
  id: string
  name: string
  target_muscle: string
  movement_pattern: string
  /** この種目が1RM管理の対象かどうか（種目ごとの属性。program_composition.tsの
   *  カテゴリ単位のhasOneRmではなく、これが実際の1RM入力要否の正）。 */
  requires_one_rm: boolean
}

const MUSCLE_LABELS: Record<string, string> = {
  chest:     '胸',
  back:      '背中',
  shoulders: '肩',
  legs:      '脚',
  arms:      '腕・コア',
  core:      '腕・コア',
}

const MUSCLE_ORDER = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core']

// ──────────────────────────────────────────────────────────
// カテゴリ一覧（lib/constants/program_composition.ts が単一情報源）
// ──────────────────────────────────────────────────────────

const ALL_CATEGORIES: CompositionCategory[] = [...BASE_CATEGORIES_BY_RANK.values(), LEG_DEFAULT_CATEGORY]

/** そのカテゴリでスワップ候補になる種目（brainstorm #3: 6パターンは動きパターン一致、それ以外は部位一致）。 */
function matchingExercises(category: CompositionCategory, exercises: ExerciseMasterRow[]): ExerciseMasterRow[] {
  return exercises.filter(e =>
    category.isSixPattern ? e.movement_pattern === category.movementPattern : e.target_muscle === category.muscle
  )
}

/**
 * カテゴリに割り当てられた種目が実際に1RM管理の対象かどうか。種目ごとの属性
 * （exercise.requires_one_rm）が正で、週2日の格下げ対象カテゴリは強制的にfalseにする
 * （program_engine.tsのhasOneRm判定と同じロジック、2026-07-08実機確認フィードバック対応）。
 */
function exerciseRequiresOneRm(
  category: CompositionCategory,
  exerciseName: string,
  exerciseByName: Map<string, ExerciseMasterRow>,
  days: DaysPerWeek,
): boolean {
  if (isOneRmDemotedAtDays(category, days)) return false
  return exerciseByName.get(exerciseName)?.requires_one_rm ?? false
}

const GEN_MESSAGES = [
  'あなたのデータを分析しています',
  'トレーニング頻度を最適化しています',
  '毎週のセット数を計算しています',
  '9週間のプログラムを構築しています',
  '最終調整をしています',
]

// ──────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────

type Step = 'frequency' | 'priority_muscles' | 'exercises' | 'one_rms' | 'program_intro' | 'install'

type OneRmEntry = {
  final_kg: string
  source: 'manual_input' | 'epley_estimated'
  epley_weight: string
  epley_reps: string
}

const defaultOneRmEntry = (): OneRmEntry => ({
  final_kg: '',
  source: 'manual_input',
  epley_weight: '',
  epley_reps: '',
})

type Props = { exercises: ExerciseMasterRow[] }

export default function OnboardingClient({ exercises }: Props) {
  const router = useRouter()
  const exerciseByName = new Map(exercises.map(e => [e.name, e]))
  const [step, setStep] = useState<Step>('frequency')
  const [daysPerWeek, setDaysPerWeek] = useState<DaysPerWeek>(4)
  const [sessionMinutes, setSessionMinutes] = useState<SessionDurationMinutes>(90)
  // 空 = 未選択（全身くまなく）。旧システムにあった「未選択なら胸」フォールバックは
  // 廃止したため、ここでも特定の部位を初期選択状態にしない（2026-07-08）。
  const [priorityMuscles, setPriorityMuscles] = useState<Set<PriorityMuscleOption>>(new Set())
  const [selectedExercises, setSelectedExercises] = useState<Set<string>>(new Set())
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({})
  // ユーザーが「今やっている種目」として明示的に選んだ結果、割り当てられたカテゴリID
  // （デフォルトで自動補完されたカテゴリは含まない。1RM入力の要否判定に使う）
  const [userSelectedCategoryIds, setUserSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [oneRms, setOneRms] = useState<Record<string, OneRmEntry>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1RM ステップ用
  const [currentOneRmIndex, setCurrentOneRmIndex] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsgIndex, setGenMsgIndex] = useState(0)

  // 1RM入力ステップのヘッダー高さ（position:stickyがiOSのソフトウェアキーボード
  // 表示時に追従を失う不具合を避けるため、ヘッダーをfixedにしてこの高さ分だけ
  // コンテンツ側にpadding-topを入れる）
  const oneRmHeaderRef = useRef<HTMLDivElement>(null)
  const [oneRmHeaderHeight, setOneRmHeaderHeight] = useState(0)

  useEffect(() => {
    if (!oneRmHeaderRef.current) return
    setOneRmHeaderHeight(oneRmHeaderRef.current.offsetHeight)
  }, [step, currentOneRmIndex])

  useEffect(() => {
    if (!generating) return
    const id = setInterval(() => setGenMsgIndex(i => (i + 1) % GEN_MESSAGES.length), 1500)
    return () => clearInterval(id)
  }, [generating])

  // ステップ・種目切り替え時に前の画面のスクロール位置が残らないよう先頭に戻す
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step, currentOneRmIndex])

  // 9週間プログラムのシート（UpperLowerBodyhypertrophy9weeks_sheet.xlsx）で
  // 指定されている種目をデフォルトにする。sort_order順の先頭とは一致しない場合があるため明示指定
  const CATEGORY_DEFAULT_OVERRIDES: Partial<Record<string, string>> = {
    chest_fly: 'ケーブルフライ',
    back_row: 'チェストサポーテッドロウ',
    triceps_1: 'ライイングトライセプスEX',
    leg_2: 'ハイバースクワット',
    leg_default: 'ハイバースクワット',
    biceps_1: 'ダンベルカール',
    biceps_2: 'インクラインダンベルカール',
  }

  // オンボーディングの種目選択チェックリストには表示しない種目名
  // （角度違いのバリエーションはコーチング画面の種目再選択でのみ選べる）
  const HIDDEN_ONBOARDING_NAMES = new Set([
    'ケーブルフライ（上部）',
    'ケーブルフライ（中部）',
    'ケーブルフライ（下部）',
  ])

  /**
   * 日数×priority選択から必要なカテゴリ一覧を求め、各カテゴリに種目を割り当てる。
   * 同じ部位の複数カテゴリ（例: chest_fly, chest_3）が同じ種目を重複して選ばないよう、
   * 一度使った種目名は次のカテゴリの候補から除外しながら順番に割り当てる。
   */
  const buildSlotSelections = (): { names: Record<string, string>; userSelected: Set<string> } => {
    const categories = buildExerciseCategories(daysPerWeek, Array.from(priorityMuscles))
    const usedNames = new Set<string>()
    const names: Record<string, string> = {}
    const userSelected = new Set<string>()

    categories.forEach(category => {
      const candidates = matchingExercises(category, exercises)
      let picked = candidates.find(e => selectedExercises.has(e.name) && !usedNames.has(e.name))
      if (picked) userSelected.add(category.id)
      if (!picked) {
        const overrideName = CATEGORY_DEFAULT_OVERRIDES[category.id]
        picked = overrideName ? candidates.find(e => e.name === overrideName && !usedNames.has(e.name)) : undefined
      }
      if (!picked) picked = candidates.find(e => !usedNames.has(e.name))
      if (!picked) picked = candidates[0]

      names[category.id] = picked?.name ?? ''
      if (picked) usedNames.add(picked.name)
    })

    return { names, userSelected }
  }

  const handleFrequencyNext = () => setStep('priority_muscles')

  const togglePriorityMuscle = (muscle: PriorityMuscleOption) => {
    setPriorityMuscles(prev => {
      const next = new Set(prev)
      if (next.has(muscle)) {
        next.delete(muscle)
      } else if (next.size < MAX_PRIORITY_MUSCLES) {
        next.add(muscle)
      }
      return next
    })
  }

  const handleExercisesNext = async () => {
    const { names: newSlotSelections, userSelected } = buildSlotSelections()
    setSlotSelections(newSlotSelections)
    setUserSelectedCategoryIds(userSelected)

    // ユーザーが「今やっている種目」として選ばなかった（＝デフォルト自動補完された）
    // カテゴリは、今やっていない種目のため重量が分からない前提で1RMを聞かない。
    // 1RM管理の要否は割り当てられた種目自体の属性で判定する（カテゴリ単位ではない、
    // 2026-07-08実機確認フィードバック対応）
    const oneRmCategories = ALL_CATEGORIES.filter(c =>
      userSelected.has(c.id) && exerciseRequiresOneRm(c, newSlotSelections[c.id] ?? '', exerciseByName, daysPerWeek)
    )

    if (oneRmCategories.length === 0) {
      setSaving(true)
      try {
        const enrollRes = await fetch('/api/program/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            days_per_week: daysPerWeek,
            session_duration_minutes: sessionMinutes,
            priority_muscles: Array.from(priorityMuscles),
            slot_assignments: Object.entries(newSlotSelections)
              .filter(([, exercise_name]) => exercise_name !== '')
              .map(([slot_id, exercise_name]) => ({ slot_id, exercise_name })),
            one_rms: [],
          }),
        })
        if (!enrollRes.ok) {
          const data = await enrollRes.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? '登録に失敗しました')
        }
        await fetch('/api/stripe/create-subscription', { method: 'POST' })
        setStep('program_intro')
      } catch (e) {
        setError(e instanceof Error ? e.message : '登録に失敗しました')
      } finally {
        setSaving(false)
      }
      return
    }

    const initial: Record<string, OneRmEntry> = {}
    oneRmCategories.forEach(category => { initial[category.id] = defaultOneRmEntry() })
    setOneRms(initial)
    setCurrentOneRmIndex(0)
    setStep('one_rms')
  }

  const toggleExercise = (ex: string) => {
    setSelectedExercises(prev => {
      const next = new Set(prev)
      if (next.has(ex)) next.delete(ex)
      else next.add(ex)
      return next
    })
  }

  const computeEpley = (slot_id: string) => {
    const entry = oneRms[slot_id]
    if (!entry) return
    const w = parseFloat(entry.epley_weight)
    const r = parseInt(entry.epley_reps)
    if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return
    const estimated = Math.round(w * (1 + r / 30) / 2.5) * 2.5
    setOneRms(prev => ({
      ...prev,
      [slot_id]: { ...(prev[slot_id] ?? defaultOneRmEntry()), final_kg: String(estimated), source: 'epley_estimated' },
    }))
  }

  const visible1RmSlots = ALL_CATEGORIES.filter(c =>
    userSelectedCategoryIds.has(c.id) && exerciseRequiresOneRm(c, slotSelections[c.id] ?? '', exerciseByName, daysPerWeek)
  )

  const advanceOneRm = () => {
    setIsExiting(true)
    setTimeout(() => {
      setCurrentOneRmIndex(i => i + 1)
      setIsExiting(false)
    }, 300)
  }

  const skipOneRm = () => {
    if (currentOneRmIndex < visible1RmSlots.length - 1) {
      advanceOneRm()
    } else {
      handleGenerate()
    }
  }

  const handleComplete = async (): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      const enrollRes = await fetch('/api/program/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: daysPerWeek,
          session_duration_minutes: sessionMinutes,
          priority_muscles: Array.from(priorityMuscles),
          slot_assignments: Object.entries(slotSelections)
            .filter(([, exercise_name]) => exercise_name !== '')
            .map(([slot_id, exercise_name]) => ({ slot_id, exercise_name })),
          one_rms: visible1RmSlots
            .filter(category => parseFloat(oneRms[category.id]?.final_kg ?? '') > 0)
            .map(category => ({
              slot_id: category.id,
              one_rm_kg: parseFloat(oneRms[category.id]!.final_kg),
              source: oneRms[category.id]?.source ?? 'manual_input',
            })),
        }),
      })
      if (!enrollRes.ok) {
        const data = await enrollRes.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? '登録に失敗しました')
      }
      await fetch('/api/stripe/create-subscription', { method: 'POST' })
      setStep('program_intro')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleOneRmBack = () => {
    setError(null)
    if (currentOneRmIndex > 0) {
      setCurrentOneRmIndex(i => i - 1)
    } else {
      setStep('exercises')
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const ok = await handleComplete()
    if (!ok) setGenerating(false)
  }

  // ── program_intro ────────────────────────────────────────
  if (step === 'program_intro') {
    const categories = buildExerciseCategories(daysPerWeek, Array.from(priorityMuscles))
    const dayCategories = distributeToDays(daysPerWeek, categories)
    const programByDay = Array.from({ length: daysPerWeek }, (_, i) => {
      const day = (i + 1) as 1 | 2 | 3 | 4
      const categoriesForDay = dayCategories.get(day) ?? []
      return {
        day,
        slots: categoriesForDay
          .map(c => ({
            slot_id: c.id,
            label: c.label,
            has_one_rm: exerciseRequiresOneRm(c, slotSelections[c.id] ?? '', exerciseByName, daysPerWeek),
            exercise: slotSelections[c.id] ?? '',
            isUserSelected: userSelectedCategoryIds.has(c.id),
          }))
          .filter(s => s.exercise),
      }
    })

    const hasAutoAdded = programByDay.some(d => d.slots.some(s => !s.isUserSelected))

    const hasIsolation = categories.some(c =>
      slotSelections[c.id] && !exerciseRequiresOneRm(c, slotSelections[c.id] ?? '', exerciseByName, daysPerWeek)
    )

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-40">
        <div className="sticky top-0 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-6 py-5 z-10">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mb-1">ステップ 5 / 6</p>
          <h1 className="text-xl font-semibold text-black dark:text-white">あなたのプログラム</h1>
        </div>

        <div className="px-4 py-6 space-y-6">
          {/* 9週間タイムライン */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">9週間の流れ</p>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-100 dark:border-zinc-800">
              {([
                { weeks: 'Week 1〜4', label: 'ボリューム期', desc: '重量に体を慣らし、フォームを固める期間。回数は少なめで丁寧に。', accent: false },
                { weeks: 'Week 5〜7', label: '強度期',       desc: 'セット数を絞って重量を上げます。筋力が一気に伸びる期間。',       accent: false },
                { weeks: 'Week 8',    label: '回復週',       desc: '積み上げた疲労をリセット。軽めに動かして体を整えます。',         accent: false },
                { weeks: 'Week 9',    label: 'MaxOut',       desc: '全力で限界まで挑戦し、9週間の自己ベストを更新します！',           accent: true  },
              ] as { weeks: string; label: string; desc: string; accent: boolean }[]).map((phase, i, arr) => (
                <div
                  key={phase.weeks}
                  className={`flex items-start gap-3 p-4 ${i < arr.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}`}
                >
                  <div className="shrink-0 pt-0.5 w-[72px]">
                    <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 leading-none">{phase.weeks}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold mb-0.5 ${phase.accent ? 'text-black dark:text-white' : 'text-black dark:text-white'}`}>
                      {phase.label}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{phase.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 重量の説明 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">重量について</p>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-start gap-3 p-4">
                <div className="w-8 h-8 rounded-xl bg-black dark:bg-white flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-white dark:text-black" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black dark:text-white mb-1">重量は自動で計算されます</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    入力した最高重量をもとに、毎週の目標重量が自動で決まります。ホーム画面のカードで確認してください。
                  </p>
                </div>
              </div>
              {hasIsolation && (
                <div className="flex items-start gap-3 p-4">
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Sliders className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black dark:text-white mb-1">補助種目は自分で調整</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      サイドレイズ・カール・腹筋などは、<span className="font-semibold text-black dark:text-white">8〜15回でちょうど限界になる重量</span>からスタートしましょう。数回こなすとアプリが次回を提案します。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 自動追加の説明 */}
          {hasAutoAdded && (
            <div className="flex items-start gap-3 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-black dark:text-white mb-1">おすすめ種目を自動追加しました</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  選択した種目に加えて、プログラムのバランスを整えるためおすすめの種目を追加しています。<span className="text-zinc-400 dark:text-zinc-500">おすすめ</span>のラベルが目印です。
                </p>
              </div>
            </div>
          )}

          {/* プログラム一覧 */}
          {programByDay.map(({ day, slots }) => (
            <div key={day} className="space-y-2">
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">
                Day {day}
              </p>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800">
                {slots.map(slot => (
                  <div
                    key={slot.slot_id}
                    className="flex items-center justify-between px-4 py-3.5"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-sm font-semibold text-black dark:text-white truncate">{slot.exercise}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{slot.label}</p>
                        {!slot.isUserSelected && (
                          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">· おすすめ</span>
                        )}
                      </div>
                    </div>
                    {slot.has_one_rm ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Zap className="w-3 h-3 text-black dark:text-white" />
                        <span className="text-xs font-medium text-black dark:text-white">自動計算</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">自己調整</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="fixed left-0 right-0 px-6 pt-6 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800"
          style={{ bottom: 0, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setStep('install')}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
          >
            はじめる
          </button>
        </div>
      </div>
    )
  }

  // ── install ─────────────────────────────────────────────
  if (step === 'install') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const isIOSChrome = isIOS && /CriOS/i.test(ua)
    const isAndroid = /Android/i.test(ua)
    const isMobile = isIOS || isAndroid
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col">
        <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-900">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mb-1">ステップ 6 / 6</p>
          <h1 className="text-xl font-semibold text-black dark:text-white">ホーム画面に追加する</h1>
        </div>
        <div className="flex-1 px-6 py-10 space-y-6">
          <div className="flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-black dark:bg-white flex items-center justify-center">
              <Smartphone className="w-10 h-10 text-white dark:text-black" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-base font-semibold text-black dark:text-white text-center">アプリとして使うと便利です</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed">
              ホーム画面に追加すると、次回からアイコンをタップするだけで開けます。
            </p>
          </div>
          {isMobile && (
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">追加方法</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {isIOS
                  ? isIOSChrome
                    ? '右上の共有ボタン（↑）をタップ → 「ホーム画面に追加」を選択'
                    : '画面下の共有ボタン（↑）をタップ → 「ホーム画面に追加」を選択'
                  : 'ブラウザメニュー（⋮）をタップ → 「ホーム画面に追加」を選択'}
              </p>
            </div>
          )}
        </div>
        <div
          className="p-6 space-y-3 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => router.push('/')}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
          >
            はじめる
          </button>
          <button onClick={() => router.push('/')} className="w-full py-3 text-sm text-zinc-400 dark:text-zinc-500">
            スキップ
          </button>
        </div>
      </div>
    )
  }

  // ── one_rms ─────────────────────────────────────────────
  if (step === 'one_rms') {
    // AI 生成中画面
    if (generating) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-10 px-8">
          <style>{`
            @keyframes auxlog-spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .auxlog-spinner { animation: auxlog-spin 0.9s linear infinite; }
            @keyframes auxlog-fade-msg {
              0%,100% { opacity: 0; transform: translateY(4px); }
              20%,80% { opacity: 1; transform: translateY(0); }
            }
            .auxlog-msg { animation: auxlog-fade-msg 1.5s ease-in-out; }
          `}</style>
          <div className="relative flex items-center justify-center w-32 h-32">
            <div className="absolute inset-0 rounded-full border-4 border-white/15 border-t-white auxlog-spinner" />
            <div className="w-20 h-20 rounded-full bg-white/8 border border-white/20 flex items-center justify-center">
              <span className="text-3xl">⚡</span>
            </div>
          </div>
          <div className="text-center space-y-3">
            <p className="text-white text-2xl font-bold tracking-tight">プログラムを生成中</p>
            <p key={genMsgIndex} className="auxlog-msg text-white/50 text-sm">
              {GEN_MESSAGES[genMsgIndex]}
            </p>
          </div>
        </div>
      )
    }

    const currentSlot = visible1RmSlots[currentOneRmIndex]
    const isLastSlot = currentOneRmIndex === visible1RmSlots.length - 1

    if (!currentSlot) return null

    const entry = oneRms[currentSlot.id] ?? defaultOneRmEntry()
    const assignedExercise = slotSelections[currentSlot.id] ?? ''
    const isCurrentValid = parseFloat(entry.final_kg) > 0

    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <style>{`
          @keyframes auxlog-card-exit {
            0% { transform: translateX(0) rotate(0deg); opacity: 1; }
            100% { transform: translateX(120%) rotate(10deg); opacity: 0; }
          }
          @keyframes auxlog-card-enter {
            0% { transform: translateX(40px); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
          .auxlog-card-exit { animation: auxlog-card-exit 0.3s ease-in forwards; }
          .auxlog-card-enter { animation: auxlog-card-enter 0.3s ease-out forwards; }
        `}</style>

        {/* Header */}
        {/* fixed: position:stickyだとiOSのソフトウェアキーボード表示時に追従が
            失われる不具合があったため、下部ボタンと同じfixedに変更した。
            高さ分はoneRmHeaderHeightで下のコンテンツにpadding-topとして反映する */}
        <div
          ref={oneRmHeaderRef}
          className="fixed top-0 left-0 right-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10"
        >
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={handleOneRmBack}
              className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors -ml-1"
              aria-label="前のステップへ"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">ステップ 4 / 6</p>
          </div>
          <h1 className="text-xl font-semibold text-black dark:text-white">最大重量を入力</h1>
          {/* 種目名 */}
          <div className="mt-1.5">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{currentSlot.label}</p>
            <p className="text-sm font-bold text-black dark:text-white">{assignedExercise}</p>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5 mt-3">
            {visible1RmSlots.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentOneRmIndex
                    ? 'w-6 bg-black dark:bg-white'
                    : i < currentOneRmIndex
                    ? 'w-3 bg-black/30 dark:bg-white/30'
                    : 'w-3 bg-zinc-200 dark:bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="px-6 py-6 overflow-hidden" style={{ paddingTop: oneRmHeaderHeight + 24 }}>
          <div
            key={currentOneRmIndex}
            className={isExiting ? 'auxlog-card-exit' : 'auxlog-card-enter'}
          >
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              {/* ヘッダーがキーボード表示時に見えなくなっても種目名がわかるよう、
                  カード内にも重複して表示する */}
              <div className="px-4 pt-4">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{currentSlot.label}</p>
                <p className="text-sm font-bold text-black dark:text-white">{assignedExercise}</p>
              </div>
              <div className="px-4 py-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    最高重量（1回だけ持ち上げられる最大の重さ）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="例: 100"
                      value={entry.final_kg}
                      onChange={e =>
                        setOneRms(prev => ({
                          ...prev,
                          [currentSlot.id]: {
                            ...(prev[currentSlot.id] ?? defaultOneRmEntry()),
                            final_kg: e.target.value,
                            source: 'manual_input',
                          },
                        }))
                      }
                      className="flex-1 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white text-sm focus:outline-none focus:border-black dark:focus:border-white"
                    />
                    <span className="text-sm text-zinc-400 shrink-0">kg</span>
                  </div>
                  {(currentSlot.id === 'leg_2' || currentSlot.id === 'leg_default') && (() => {
                    const squatRm = parseFloat(oneRms['leg_squat']?.final_kg ?? '')
                    if (!squatRm || squatRm <= 0) return null
                    const derived = Math.round(squatRm * 0.8 / 2.5) * 2.5
                    return (
                      <button
                        onClick={() => setOneRms(prev => ({
                          ...prev,
                          [currentSlot.id]: { ...(prev[currentSlot.id] ?? defaultOneRmEntry()), final_kg: String(derived), source: 'manual_input' },
                        }))}
                        className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 underline underline-offset-2"
                      >
                        スクワットの80%（{derived}kg）を使う
                      </button>
                    )
                  })()}
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 space-y-3">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    最高重量がわからない場合
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    直近で行ったセットの重量と回数を入力してください
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="重量"
                      value={entry.epley_weight}
                      onChange={e =>
                        setOneRms(prev => ({
                          ...prev,
                          [currentSlot.id]: {
                            ...(prev[currentSlot.id] ?? defaultOneRmEntry()),
                            epley_weight: e.target.value,
                          },
                        }))
                      }
                      className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white text-sm focus:outline-none"
                    />
                    <span className="text-sm text-zinc-400 shrink-0">kg ×</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="回"
                      value={entry.epley_reps}
                      onChange={e =>
                        setOneRms(prev => ({
                          ...prev,
                          [currentSlot.id]: {
                            ...(prev[currentSlot.id] ?? defaultOneRmEntry()),
                            epley_reps: e.target.value,
                          },
                        }))
                      }
                      className="w-16 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white text-sm focus:outline-none"
                    />
                    <span className="text-sm text-zinc-400 shrink-0">回</span>
                  </div>
                  <button
                    onClick={() => computeEpley(currentSlot.id)}
                    className="w-full py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    推定する
                  </button>
                  {entry.source === 'epley_estimated' && entry.final_kg && (
                    <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
                      推定した最高重量:{' '}
                      <span className="font-semibold text-black dark:text-white">{entry.final_kg} kg</span>{' '}
                      を上の欄に反映しました
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Bottom buttons */}
        <div
          className="fixed left-0 right-0 px-6 pt-4 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900 space-y-3"
          style={{ bottom: 0, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          {!isLastSlot ? (
            <button
              onClick={advanceOneRm}
              disabled={!isCurrentValid}
              className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
            >
              次へ
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!isCurrentValid || saving}
              className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
            >
              プログラムを生成する
            </button>
          )}
          <button
            onClick={skipOneRm}
            disabled={saving}
            className="w-full py-2 text-xs text-zinc-400 dark:text-zinc-500 disabled:opacity-40"
          >
            {isLastSlot ? 'スキップしてプログラムを生成する' : 'わからないのでスキップ'}
          </button>
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
            {currentOneRmIndex + 1} / {visible1RmSlots.length}
          </p>
        </div>
      </div>
    )
  }

  // ── priority_muscles ──────────────────────────────────────
  if (step === 'priority_muscles') {
    return (
      <div className="min-h-screen bg-white dark:bg-black pb-40">
        <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setStep('frequency')}
              className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors -ml-1"
              aria-label="前のステップへ"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">ステップ 2 / 6</p>
          </div>
          <h1 className="text-xl font-semibold text-black dark:text-white">優先的に鍛えたい部位は？</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            選んだ部位は種目が追加され、セッション75分・90分ではセット数も段階的に増えます（60分ではセット数は増えません）。最大{MAX_PRIORITY_MUSCLES}つまで選べます。
          </p>
        </div>

        <div className="px-6 py-8 space-y-3">
          {PRIORITY_MUSCLE_OPTION_ORDER.map(muscle => {
            const isSelected = priorityMuscles.has(muscle)
            const isDisabled = !isSelected && priorityMuscles.size >= MAX_PRIORITY_MUSCLES
            return (
              <button
                key={muscle}
                onClick={() => togglePriorityMuscle(muscle)}
                disabled={isDisabled}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-colors disabled:opacity-40 ${
                  isSelected
                    ? 'border-black dark:border-white bg-black dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <span className={`text-base font-semibold ${isSelected ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                  {PRIORITY_MUSCLE_OPTION_LABELS[muscle]}
                </span>
                {isSelected && <Check className="w-5 h-5 text-white dark:text-black" />}
              </button>
            )
          })}
        </div>

        <div
          className="fixed left-0 right-0 px-6 pt-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
          style={{ bottom: 0, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setStep('exercises')}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
          >
            次へ
          </button>
        </div>
      </div>
    )
  }

  // ── exercises ────────────────────────────────────────────
  if (step === 'exercises') {
    // exercisesは既にmovement_patternを持つもの（=いずれかのカテゴリに該当しうる種目）のみ
    // サーバー側で絞り込み済み（app/onboarding/page.tsx参照）
    const visibleExercises = exercises.filter(e => !HIDDEN_ONBOARDING_NAMES.has(e.name))

    // arms・coreは同じ「腕・コア」ラベルで1グループにまとめて表示する
    // （別々のグループにすると同じ見出しが2回表示されてしまうため）
    const groupKey = (muscle: string) => (muscle === 'core' ? 'arms' : muscle)

    const groupMap: Record<string, string[]> = {}
    for (const ex of visibleExercises) {
      const key = groupKey(ex.target_muscle)
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(ex.name)
    }
    const visibleGroups = MUSCLE_ORDER
      .filter(m => groupKey(m) === m && groupMap[m]?.length)
      .map(m => ({ muscle: m, label: MUSCLE_LABELS[m] ?? m, exercises: groupMap[m] }))

    return (
      <div className="min-h-screen bg-white dark:bg-black pb-40">
        <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setStep('priority_muscles')}
              className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors -ml-1"
              aria-label="前のステップへ"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">ステップ 3 / 6</p>
          </div>
          <h1 className="text-xl font-semibold text-black dark:text-white">今やっている種目を選ぶ</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            やっていない種目は自動でデフォルトが設定されます
          </p>
        </div>

        <div className="px-6 py-6 space-y-8">
          {visibleGroups.map(group => (
            <div key={group.muscle}>
              <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.exercises.map(ex => {
                  const isChecked = selectedExercises.has(ex)
                  return (
                    <button
                      key={ex}
                      onClick={() => toggleExercise(ex)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-colors ${
                        isChecked
                          ? 'border-black dark:border-white bg-black dark:bg-white'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          isChecked ? 'text-white dark:text-black' : 'text-black dark:text-white'
                        }`}
                      >
                        {ex}
                      </span>
                      {isChecked && <Check className="w-4 h-4 text-white dark:text-black shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          className="fixed left-0 right-0 px-6 pt-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
          style={{ bottom: 0, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleExercisesNext}
            disabled={saving}
            className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold disabled:opacity-40"
          >
            {saving ? '登録中...' : selectedExercises.size > 0 ? `次へ（${selectedExercises.size}種目選択中）` : '次へ（全てデフォルトで設定）'}
          </button>
        </div>
      </div>
    )
  }

  // ── frequency (default) ──────────────────────────────────
  return (
    <div className="min-h-screen bg-white dark:bg-black pb-40">
      <div className="sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 px-6 py-5 z-10">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mb-1">ステップ 1 / 6</p>
        <h1 className="text-xl font-semibold text-black dark:text-white">トレーニング設定</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          週の頻度と1回のセッション時間を教えてください
        </p>
      </div>

      <div className="px-6 py-8 space-y-8">
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">週何回？</h2>
          {(
            [
              { days: 2 as const, title: '週2回', sub: 'Day 1 と Day 2' },
              { days: 3 as const, title: '週3回', sub: 'Day 1 〜 Day 3' },
              { days: 4 as const, title: '週4回', sub: 'Day 1 〜 Day 4' },
            ] as const
          ).map(({ days, title, sub }) => {
            const isSelected = daysPerWeek === days
            return (
              <button
                key={days}
                onClick={() => setDaysPerWeek(days)}
                className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-colors ${
                  isSelected
                    ? 'border-black dark:border-white bg-black dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-base font-semibold ${isSelected ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                    {title}
                  </span>
                  {isSelected && <Check className="w-5 h-5 text-white dark:text-black" />}
                </div>
                <p className={`mt-0.5 text-sm ${isSelected ? 'text-white/70 dark:text-black/60' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {sub}
                </p>
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            1回のセッション時間は？
          </h2>
          {(
            [
              { mins: 60 as const, title: '〜60分' },
              { mins: 75 as const, title: '60〜90分' },
              { mins: 90 as const, title: '90分〜' },
            ] as const
          ).map(({ mins, title }) => {
            const isSelected = sessionMinutes === mins
            return (
              <button
                key={mins}
                onClick={() => setSessionMinutes(mins)}
                className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-colors ${
                  isSelected
                    ? 'border-black dark:border-white bg-black dark:bg-white'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-base font-semibold ${isSelected ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                    {title}
                  </span>
                  {isSelected && <Check className="w-5 h-5 text-white dark:text-black" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="fixed left-0 right-0 px-6 pt-6 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
        style={{ bottom: 0, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleFrequencyNext}
          className="w-full py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold"
        >
          次へ
        </button>
      </div>
    </div>
  )
}
