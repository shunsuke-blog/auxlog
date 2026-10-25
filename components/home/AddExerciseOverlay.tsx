'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Plus, Search, X } from 'lucide-react'
import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS } from '@/types'

type MasterExercise = { id: string; name: string; target_muscle: string }

type Props = {
  /** すでにメニューにある種目（候補から外す） */
  excludedNames: ReadonlySet<string>
  /** 一覧の上の説明 */
  note: string
  /** 選んだ種目の user_exercises.id（自分の種目に無ければ登録してから渡す。登録に失敗したら null） */
  onPicked: (exerciseId: string | null) => void
  onClose: () => void
}

// 種目を選ぶ全画面のオーバーレイ（ホームの「種目を追加」）。セルフモード（その週だけの追加種目にする）と
// コーチングモード（プラン外の種目として記録画面へ）で共通（2026-10-25 ProgramDayView から切り出した）。
export default function AddExerciseOverlay({ excludedNames, note, onPicked, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [masterExercises, setMasterExercises] = useState<MasterExercise[]>([])
  // exercise_master.id → user_exercises.id のマップ
  const [masterToUserExId, setMasterToUserExId] = useState<Map<string, string>>(new Map())
  const [masterLoading, setMasterLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // マスタに無い名前で追加する場合だけ、部位を選ぶサブステップを挟む（モバイル版と同じ、2026-08-05。
  // 部位が無いと種目が部位未設定のまま登録されてしまうため）
  const [pendingCustomName, setPendingCustomName] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 開いたとき、マスタ種目とユーザー種目を並列で読む
  useEffect(() => {
    Promise.all([
      fetch('/api/exercises/master').then(r => r.json()),
      fetch('/api/exercises').then(r => r.json()),
    ])
      .then(([masterData, userExData]) => {
        setMasterExercises(masterData.exercises ?? [])
        const map = new Map<string, string>()
        for (const ue of (userExData.exercises ?? [])) {
          if (ue.exercise_master_id) map.set(ue.exercise_master_id, ue.id)
        }
        setMasterToUserExId(map)
      })
      .catch(() => {})
      .finally(() => setMasterLoading(false))
  }, [])

  const pick = async (ex: { id: string | null; masterId: string | null; name: string; target_muscle?: string }) => {
    if (busy) return
    setBusy(true)
    let finalId = ex.id
    // user_exercises 未登録の場合は自動登録してIDを取得
    if (!finalId) {
      try {
        const body = ex.masterId
          ? { exercise_master_id: ex.masterId }
          : { custom_name: ex.name, custom_target_muscle: ex.target_muscle, is_compound: false }
        const res = await fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          finalId = data.exercise?.id ?? null
        }
      } catch { /* ignore — 呼び出し側で null を扱う */ }
    }
    onPicked(finalId)
  }

  const trimmedQuery = searchQuery.trim()
  const filteredMaster = trimmedQuery ? masterExercises.filter(e => e.name.includes(trimmedQuery)) : masterExercises

  return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-black">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-zinc-100 dark:border-zinc-900">
          {pendingCustomName ? (
            <button
              onClick={() => setPendingCustomName(null)}
              className="flex-1 min-w-0 flex items-center gap-1 text-left text-[15px] text-zinc-500 dark:text-zinc-400"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span className="truncate">「{pendingCustomName}」の部位</span>
            </button>
          ) : (
          <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="種目名で検索..."
              autoFocus
              className="flex-1 text-[15px] text-black dark:text-white bg-transparent placeholder:text-zinc-400 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          )}
          <button
            onClick={onClose}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 shrink-0"
          >
            キャンセル
          </button>
        </div>

        <p className="px-5 pt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
          {note}
        </p>

        {/* リスト */}
        <div className="flex-1 overflow-y-auto">
          {pendingCustomName ? (
            <div className="grid grid-cols-2 gap-2 p-5">
              {MUSCLE_ORDER.map(m => (
                <button
                  key={m}
                  onClick={() => pick({ id: null, masterId: null, name: pendingCustomName, target_muscle: m })}
                  disabled={busy}
                  className="py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-semibold text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  {TARGET_MUSCLE_LABELS[m]}
                </button>
              ))}
            </div>
          ) : masterLoading ? (
            <p className="text-sm text-zinc-400 text-center py-12">読み込み中...</p>
          ) : (
            <>
              {filteredMaster
                .filter(e => !excludedNames.has(e.name))
                .map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => pick({
                      // user_exercises.id を使う。未登録の場合は null（記録画面で種目なし遷移）
                      id: masterToUserExId.get(ex.id) ?? null,
                      masterId: ex.id,
                      name: ex.name,
                      target_muscle: ex.target_muscle,
                    })}
                    className="w-full flex items-center px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                  >
                    <span className="text-[15px] text-black dark:text-white">{ex.name}</span>
                  </button>
                ))}

              {/* DBにない場合は自由入力で追加 */}
              {trimmedQuery && !filteredMaster.some(e => e.name === trimmedQuery) && (
                <button
                  onClick={() => setPendingCustomName(trimmedQuery)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-zinc-50 dark:border-zinc-900 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-[15px] text-zinc-500 dark:text-zinc-400">
                    「{trimmedQuery}」を追加する
                  </span>
                </button>
              )}

              {!masterLoading && filteredMaster.length === 0 && !trimmedQuery && (
                <p className="text-sm text-zinc-400 text-center py-12">種目が見つかりません</p>
              )}
            </>
          )}
        </div>
      </div>
  )
}
