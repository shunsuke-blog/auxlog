'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

type OneRm = {
  slot_id: string
  exercise_name: string
  one_rm_kg: number
  recorded_at: string
}

type Props = {
  enrollmentId: string | null
  daysPerWeek: number | null
  sessionMinutes: number | null
  currentWeek: number | null
  startedAt: string | null
  oneRms: OneRm[]
}

const SLOT_LABELS: Record<string, string> = {
  chest_compound:             '胸・メイン',
  chest_triceps_compound:     '胸・三頭',
  shoulder_vertical_press:    '肩プレス',
  quad_glute_primary:         'スクワット系',
  quad_glute_secondary:       'スクワット系（補助）',
  hamstring_glute_heavy:      'デッドリフト系',
}

export default function ProgramSection({ enrollmentId, daysPerWeek, sessionMinutes, currentWeek, startedAt, oneRms }: Props) {
  const router = useRouter()
  const [resetting, setResetting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleReset = async () => {
    if (!confirm) {
      setConfirm(true)
      setResetError(null)
      return
    }
    setResetting(true)
    try {
      const res = await fetch('/api/program/reset', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.push('/onboarding')
    } catch {
      setResetting(false)
      setConfirm(false)
      setResetError('リセットに失敗しました。もう一度お試しください。')
    }
  }

  if (!enrollmentId) return null

  const sessionLabel =
    sessionMinutes === 60 ? '〜60分' :
    sessionMinutes === 75 ? '60〜90分' : '90分〜'

  const startDate = startedAt
    ? new Date(startedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
    : null

  return (
    <div className="space-y-3">
      {/* プログラム概要 */}
      <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">プログラム</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">頻度</span>
            <span className="text-sm text-black dark:text-white">週{daysPerWeek}回</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">セッション時間</span>
            <span className="text-sm text-black dark:text-white">{sessionLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">現在の週</span>
            <span className="text-sm text-black dark:text-white">Week {currentWeek} / 9</span>
          </div>
          {startDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">開始日</span>
              <span className="text-sm text-black dark:text-white">{startDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* 最高重量一覧 */}
      {oneRms.length > 0 && (
        <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">入力した最高重量</h2>
          <div className="space-y-2">
            {oneRms.map(r => (
              <div key={r.slot_id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-black dark:text-white">{r.exercise_name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{SLOT_LABELS[r.slot_id] ?? r.slot_id}</p>
                </div>
                <span className="text-sm font-semibold text-black dark:text-white tabular-nums">
                  {r.one_rm_kg} kg
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            ※ 重量はプログラム開始時に入力した値です
          </p>
        </div>
      )}

      {/* リセット */}
      <button
        onClick={handleReset}
        disabled={resetting}
        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-colors ${
          confirm
            ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950'
            : 'border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950'
        }`}
      >
        <div className="flex items-center gap-3">
          <RefreshCw className={`w-4 h-4 ${confirm ? 'text-red-500' : 'text-zinc-400'}`} />
          <span className={`text-sm ${confirm ? 'text-red-500 font-semibold' : 'text-black dark:text-white'}`}>
            {resetting ? 'リセット中...' : confirm ? '本当にリセットしますか？（もう一度タップ）' : 'プログラムをリセットして再開する'}
          </span>
        </div>
      </button>
      {resetError && (
        <p className="text-xs text-red-500 text-center px-1">{resetError}</p>
      )}
    </div>
  )
}
