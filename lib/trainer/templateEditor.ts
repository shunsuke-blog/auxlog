// テンプレート編集画面の型と変換（DBの行 ⇔ 編集用の状態 ⇔ 保存APIの送信形式）。

import { MUSCLE_ORDER, TARGET_MUSCLE_LABELS, type TargetMuscle } from '@/types'

/** 種目の一覧のまとまり（部位の並びのあとに有酸素、2026-10-26） */
export const PLAN_MUSCLE_GROUPS: { key: string; label: string }[] = [
  ...MUSCLE_ORDER.map(m => ({ key: m as string, label: TARGET_MUSCLE_LABELS[m] })),
  { key: 'cardio', label: '有酸素' },
]

/** 部位の表示名（有酸素を含む） */
export const muscleGroupLabel = (m: string | null) =>
  !m ? '' : m === 'cardio' ? '有酸素' : TARGET_MUSCLE_LABELS[m as TargetMuscle] ?? m

export type WeightMode = 'pct' | 'kg' | 'auto'

export type EditorSet = {
  mode: WeightMode
  value: string // pct のときは % の数値（75 = 75%）、kg のときは kg
  reps: string
  rir: string
  isWarmup: boolean
}

export type EditorExercise = {
  key: string
  exerciseMasterId: string | null
  trainerExerciseId: string | null
  /** 有酸素の一覧（cardio_master）の種目（2026-10-26） */
  cardioMasterId?: string | null
  name: string
  targetMuscle: string | null
  note: string
  sets: EditorSet[]
  /** 有酸素の種目の目標（分・km）。有酸素はセットを持たない */
  targetMinutes?: string
  targetDistanceKm?: string
}

export type CatalogExercise = {
  exerciseMasterId: string | null
  trainerExerciseId: string | null
  /** 有酸素の一覧（cardio_master）の種目 */
  cardioMasterId?: string | null
  name: string
  targetMuscle: string | null
  /** 動きの種類（種目マスタのみ）。入れ替えの候補で「同じ動き」を先に出すのに使う */
  movementPattern?: string | null
  /** 1RM管理の種目か（種目マスタの requires_one_rm。独自の種目は false） */
  requiresOneRm?: boolean
}

export type PlanSetRow = {
  set_number: number
  target_pct_1rm: number | string | null
  target_weight_kg: number | string | null
  target_reps: number
  target_rir: number | null
  is_warmup: boolean
}

export type PlanExerciseRow = {
  sort_order: number
  note: string | null
  exercise_master_id: string | null
  trainer_exercise_id: string | null
  cardio_master_id: string | null
  target_duration_seconds: number | null
  target_distance_km: number | string | null
  exercise_master: { name: string; target_muscle: string | null } | null
  trainer_exercises: { name: string; target_muscle: string | null } | null
  cardio_master: { name: string } | null
  plan_sets: PlanSetRow[]
}

/** 有酸素運動の種目か（有酸素の一覧の種目、または部位が有酸素の独自種目） */
export const isCardioExercise = (ex: { cardioMasterId?: string | null; targetMuscle: string | null }) =>
  ex.cardioMasterId != null || ex.targetMuscle === 'cardio'

/** 種目を区別するキー（一覧の種目・独自種目・有酸素の一覧で別々） */
export const exerciseIdOf = (ex: { exerciseMasterId: string | null; trainerExerciseId: string | null; cardioMasterId?: string | null }) =>
  ex.exerciseMasterId ? `m:${ex.exerciseMasterId}` : ex.cardioMasterId ? `c:${ex.cardioMasterId}` : `t:${ex.trainerExerciseId}`

let keySeq = 0
export const newKey = () => `ex-${Date.now()}-${keySeq++}`

export function toEditorExercises(rows: PlanExerciseRow[]): EditorExercise[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => ({
      key: newKey(),
      exerciseMasterId: r.exercise_master_id,
      trainerExerciseId: r.trainer_exercise_id,
      cardioMasterId: r.cardio_master_id,
      name: r.exercise_master?.name ?? r.trainer_exercises?.name ?? r.cardio_master?.name ?? '',
      targetMuscle: r.cardio_master_id ? 'cardio' : (r.exercise_master?.target_muscle ?? r.trainer_exercises?.target_muscle ?? null),
      note: r.note ?? '',
      targetMinutes: r.target_duration_seconds != null ? String(Math.round(r.target_duration_seconds / 60)) : '',
      targetDistanceKm: r.target_distance_km != null ? String(Number(r.target_distance_km)) : '',
      sets: [...r.plan_sets]
        .sort((a, b) => a.set_number - b.set_number)
        .map(s => {
          const pct = s.target_pct_1rm == null ? null : Number(s.target_pct_1rm)
          const kg = s.target_weight_kg == null ? null : Number(s.target_weight_kg)
          return {
            mode: pct != null ? 'pct' : kg != null ? 'kg' : 'auto',
            value: pct != null ? String(Math.round(pct * 1000) / 10) : kg != null ? String(kg) : '',
            reps: String(s.target_reps),
            rir: s.target_rir == null ? '' : String(s.target_rir),
            isWarmup: s.is_warmup,
          } satisfies EditorSet
        }),
    }))
}

// 保存APIの形式に変換する。入力が不正なら理由を返す（保存させない）。
export function toSavePayload(exercises: EditorExercise[]): { ok: true; exercises: unknown[] } | { ok: false; error: string } {
  const out: unknown[] = []
  for (const ex of exercises) {
    // 有酸素はセットの代わりに目標の時間（必須）・距離（任意）
    if (isCardioExercise(ex)) {
      const minutes = Number(ex.targetMinutes ?? '')
      if (!(ex.targetMinutes ?? '').trim() || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        return { ok: false, error: `${ex.name} の目標の時間（分）を1〜1440で入力してください` }
      }
      const kmText = (ex.targetDistanceKm ?? '').trim()
      const km = kmText ? Number(kmText) : null
      if (km != null && (!Number.isFinite(km) || km <= 0 || km > 1000)) return { ok: false, error: `${ex.name} の目標の距離（km）を確認してください` }
      out.push({
        exercise_master_id: null,
        trainer_exercise_id: ex.trainerExerciseId,
        cardio_master_id: ex.cardioMasterId ?? null,
        note: ex.note.trim() === '' ? null : ex.note.trim(),
        target_duration_seconds: Math.round(minutes * 60),
        target_distance_km: km != null ? Math.round(km * 100) / 100 : null,
        sets: [],
      })
      continue
    }
    const sets = []
    for (const [i, s] of ex.sets.entries()) {
      const reps = parseInt(s.reps, 10)
      if (!Number.isFinite(reps) || reps < 1) return { ok: false, error: `${ex.name} の${i + 1}セット目の回数を入力してください` }
      const rir = s.rir.trim() === '' ? null : parseInt(s.rir, 10)
      if (rir != null && (!Number.isFinite(rir) || rir < 0 || rir > 10)) return { ok: false, error: `${ex.name} の${i + 1}セット目のRIRは0〜10で入力してください` }
      let pct: number | null = null
      let kg: number | null = null
      if (s.mode !== 'auto') {
        const v = parseFloat(s.value)
        if (!Number.isFinite(v) || v <= 0) return { ok: false, error: `${ex.name} の${i + 1}セット目の重量を入力してください` }
        if (s.mode === 'pct') {
          if (v > 120) return { ok: false, error: `${ex.name} の${i + 1}セット目の%は120以下で入力してください` }
          pct = Math.round(v * 10) / 1000
        } else {
          kg = v
        }
      }
      sets.push({ target_pct_1rm: pct, target_weight_kg: kg, target_reps: reps, target_rir: rir, is_warmup: s.isWarmup })
    }
    out.push({
      exercise_master_id: ex.exerciseMasterId,
      trainer_exercise_id: ex.trainerExerciseId,
      cardio_master_id: null,
      note: ex.note.trim() === '' ? null : ex.note.trim(),
      target_duration_seconds: null,
      target_distance_km: null,
      sets,
    })
  }
  return { ok: true, exercises: out }
}
