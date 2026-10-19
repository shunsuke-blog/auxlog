// テンプレート編集画面の型と変換（DBの行 ⇔ 編集用の状態 ⇔ 保存APIの送信形式）。

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
  name: string
  targetMuscle: string | null
  note: string
  sets: EditorSet[]
}

export type CatalogExercise = {
  exerciseMasterId: string | null
  trainerExerciseId: string | null
  name: string
  targetMuscle: string | null
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
  exercise_master: { name: string; target_muscle: string | null } | null
  trainer_exercises: { name: string; target_muscle: string | null } | null
  plan_sets: PlanSetRow[]
}

let keySeq = 0
export const newKey = () => `ex-${Date.now()}-${keySeq++}`

export function toEditorExercises(rows: PlanExerciseRow[]): EditorExercise[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => ({
      key: newKey(),
      exerciseMasterId: r.exercise_master_id,
      trainerExerciseId: r.trainer_exercise_id,
      name: r.exercise_master?.name ?? r.trainer_exercises?.name ?? '',
      targetMuscle: r.exercise_master?.target_muscle ?? r.trainer_exercises?.target_muscle ?? null,
      note: r.note ?? '',
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
      note: ex.note.trim() === '' ? null : ex.note.trim(),
      sets,
    })
  }
  return { ok: true, exercises: out }
}
