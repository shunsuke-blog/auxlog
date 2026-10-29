import type { DetailExercise, RecordedBy, TraineeDetail } from './trainees'
import type { CoachingRecordData } from '@/lib/coaching/record'
import { parseCardioInput } from '@/lib/record/cardio'

// トレーナーがクライアントの記録を直す・代わりに入力する画面の状態と、保存する形への変換（2026-10-29）。
// 記録は「✓ を付けたセット」だけを保存する。代理入力はプランの目標を初期値にした ✓ の無いセットから始め、
// ✓ を付けた時に初めて記録ができる。すべての ✓ を外すと記録は消える（元に戻すで戻せる）。

export type EditSet = {
  key: string
  weight: string
  reps: string
  isWarmup: boolean
  rir: boolean
  done: boolean
}

export type EditCardio = { minutes: string; distanceKm: string; calories: string; tracksDistance: boolean; done: boolean }

export type EditExercise = {
  key: string
  /** クライアントの種目（user_exercises）。代理入力で初めての種目は null（保存の時に DB でプランの種目から用意する） */
  exerciseId: string | null
  planExerciseId: string | null
  name: string
  offPlan: boolean
  isBodyweight: boolean
  sets: EditSet[]
  /** 有酸素運動の種目（その時 sets は空） */
  cardio: EditCardio | null
}

export type EditSession = {
  id: string
  trainedOn: string
  recordedBy: RecordedBy
  exercises: EditExercise[]
}

export type SavePayloadSet = {
  exercise_id: string | null
  plan_exercise_id: string | null
  set_number: number
  weight_kg: number
  reps: number
  rir: boolean
  is_warmup: boolean
  duration_seconds: number | null
  distance_km: number | null
  calories_kcal: number | null
}

let seq = 0
export const newKey = () => `r${++seq}`

const numText = (n: number | null | undefined) => (n == null ? '' : String(n))

/** 読み込んだ記録 → 画面の状態（記録済みのセットはすべて ✓） */
export function toEditSessions(sessions: TraineeDetail['sessions']): EditSession[] {
  return sessions.map(s => ({
    id: s.id,
    trainedOn: s.trainedOn,
    recordedBy: s.recordedBy,
    exercises: s.exercises.map(fromDetailExercise),
  }))
}

function fromDetailExercise(e: DetailExercise): EditExercise {
  const cardioSet = e.cardio != null ? e.sets[0] : null
  return {
    key: newKey(),
    exerciseId: e.exerciseId,
    planExerciseId: e.planExerciseId,
    name: e.name,
    offPlan: e.offPlan,
    isBodyweight: e.isBodyweight,
    sets: cardioSet ? [] : e.sets.map(st => ({ key: newKey(), weight: numText(st.weightKg), reps: numText(st.reps), isWarmup: st.isWarmup, rir: st.rir, done: true })),
    cardio: cardioSet
      ? {
          minutes: cardioSet.durationSeconds != null ? numText(Math.round(cardioSet.durationSeconds / 60)) : '',
          distanceKm: numText(cardioSet.distanceKm),
          calories: numText(cardioSet.caloriesKcal),
          tracksDistance: true,
          done: true,
        }
      : null,
  }
}

/** 代理入力の新しい記録: プランの目標（重量が「自動」なら前回の記録の重量）を初期値にし、✓ は付けない */
export function draftFromPrefill(id: string, trainedOn: string, data: CoachingRecordData): EditSession {
  return {
    id,
    trainedOn,
    recordedBy: 'trainer',
    exercises: [{
      key: newKey(),
      exerciseId: null,
      planExerciseId: data.planExerciseId,
      name: data.name,
      offPlan: false,
      isBodyweight: data.isBodyweight,
      sets: data.cardio ? [] : data.prefill.map(p => ({ key: newKey(), weight: numText(p.weightKg), reps: numText(p.reps), isWarmup: p.isWarmup, rir: false, done: false })),
      cardio: data.cardio
        ? {
            minutes: data.cardio.targetDurationSeconds != null ? numText(Math.round(data.cardio.targetDurationSeconds / 60)) : '',
            distanceKm: numText(data.cardio.targetDistanceKm),
            calories: '',
            tracksDistance: data.cardio.tracksDistance,
            done: false,
          }
        : null,
    }],
  }
}

/** 新しいセット: 直前のセットの重量・回数を引き継ぐ（✓ は付けない） */
export function nextSet(sets: EditSet[]): EditSet {
  const last = sets.filter(s => !s.isWarmup).at(-1) ?? sets.at(-1)
  return { key: newKey(), weight: last?.weight ?? '', reps: last?.reps ?? '', isWarmup: false, rir: false, done: false }
}

/** 記録したプランの種目（✓ のセットがある種目） */
export function recordedPlanExerciseIds(sessions: EditSession[]): Set<string> {
  const ids = new Set<string>()
  for (const s of sessions) for (const e of s.exercises) {
    if (e.planExerciseId && (e.cardio ? e.cardio.done : e.sets.some(st => st.done))) ids.add(e.planExerciseId)
  }
  return ids
}

/**
 * 保存する形へ。✓ のセットだけを、種目ごとに 1 からの番号で送る。sets が空なら記録を消す。
 * ✓ のセットの入力が途中（回数が空など）なら保存しない（理由を返す）。
 */
export function toSavePayload(session: EditSession): { ok: true; sets: SavePayloadSet[] } | { ok: false; error: string } {
  const sets: SavePayloadSet[] = []
  for (const e of session.exercises) {
    const base = { exercise_id: e.exerciseId, plan_exercise_id: e.planExerciseId }
    if (e.cardio) {
      if (!e.cardio.done) continue
      const parsed = parseCardioInput(e.cardio)
      if (!parsed) return { ok: false, error: `${e.name}: 時間（分）を入力してください` }
      sets.push({ ...base, set_number: 1, weight_kg: 0, reps: 0, rir: false, is_warmup: false, ...parsed })
      continue
    }
    let n = 0
    for (const st of e.sets) {
      if (!st.done) continue
      const reps = Number(st.reps)
      if (!st.reps.trim() || !Number.isInteger(reps) || reps < 0 || reps > 200) return { ok: false, error: `${e.name}: 回数を入力してください` }
      const weight = st.weight.trim() === '' && e.isBodyweight ? 0 : Number(st.weight)
      if ((st.weight.trim() === '' && !e.isBodyweight) || !Number.isFinite(weight) || weight < 0 || weight > 500) return { ok: false, error: `${e.name}: 重量を入力してください` }
      sets.push({ ...base, set_number: ++n, weight_kg: weight, reps, rir: st.rir, is_warmup: st.isWarmup, duration_seconds: null, distance_km: null, calories_kcal: null })
    }
  }
  return { ok: true, sets }
}
