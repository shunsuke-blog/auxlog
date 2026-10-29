// lib/trainer/clientRecordEditor.ts のテスト（2026-10-29 トレーナーがクライアントの記録を直す）。実行: npx tsx --test lib/trainer/clientRecordEditor.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftFromPrefill, nextSet, recordedPlanExerciseIds, toEditSessions, toSavePayload, type EditSession } from './clientRecordEditor'
import type { CoachingRecordData } from '@/lib/coaching/record'

const prefill = (patch: Partial<CoachingRecordData> = {}): CoachingRecordData => ({
  planExerciseId: 'pe1', name: 'ベンチプレス', note: null, day: 1, isBodyweight: false,
  prefill: [
    { setNumber: 1, weightKg: 40, weightIsTarget: true, reps: 5, rir: null, isWarmup: true },
    { setNumber: 2, weightKg: 60, weightIsTarget: true, reps: 8, rir: 2, isWarmup: false },
    { setNumber: 3, weightKg: null, weightIsTarget: false, reps: 8, rir: 2, isWarmup: false },
  ],
  alreadyRecorded: false, prevBest: null, beforeWeekStart: false, cardio: null, ...patch,
})

test('代理入力: 目標を初期値にし、✓ の無いセットは保存しない', () => {
  const draft = draftFromPrefill('s1', '2026-10-29', prefill())
  assert.deepEqual(draft.exercises[0].sets.map(s => [s.weight, s.reps, s.done]), [['40', '5', false], ['60', '8', false], ['', '8', false]])
  const payload = toSavePayload(draft)
  assert.deepEqual(payload, { ok: true, sets: [] })
})

test('✓ のセットだけを 1 からの番号で送る。初めての種目は plan_exercise_id だけ', () => {
  const draft = draftFromPrefill('s1', '2026-10-29', prefill())
  draft.exercises[0].sets[1].done = true
  const payload = toSavePayload(draft)
  assert.ok(payload.ok)
  assert.deepEqual(payload.sets, [{
    exercise_id: null, plan_exercise_id: 'pe1', set_number: 1, weight_kg: 60, reps: 8, rir: false, is_warmup: false,
    duration_seconds: null, distance_km: null, calories_kcal: null,
  }])
})

test('✓ のセットの重量が空なら保存しない（自重の種目は 0kg）', () => {
  const draft = draftFromPrefill('s1', '2026-10-29', prefill())
  draft.exercises[0].sets[2].done = true
  assert.deepEqual(toSavePayload(draft), { ok: false, error: 'ベンチプレス: 重量を入力してください' })
  draft.exercises[0].isBodyweight = true
  const payload = toSavePayload(draft)
  assert.ok(payload.ok && payload.sets[0].weight_kg === 0)
})

test('有酸素: 時間が無ければ保存しない、あれば1行で重量・回数は 0', () => {
  const draft = draftFromPrefill('s1', '2026-10-29', prefill({
    name: 'ランニング', prefill: [],
    cardio: { targetDurationSeconds: 1800, targetDistanceKm: 5, tracksDistance: true, previous: null },
  }))
  const cardio = draft.exercises[0].cardio!
  assert.deepEqual([cardio.minutes, cardio.distanceKm, cardio.done], ['30', '5', false])
  cardio.done = true
  cardio.minutes = ''
  assert.equal(toSavePayload(draft).ok, false)
  cardio.minutes = '32'
  const payload = toSavePayload(draft)
  assert.ok(payload.ok)
  assert.deepEqual(payload.sets[0], {
    exercise_id: null, plan_exercise_id: 'pe1', set_number: 1, weight_kg: 0, reps: 0, rir: false, is_warmup: false,
    duration_seconds: 1920, distance_km: 5, calories_kcal: null,
  })
})

test('読み込んだ記録はすべて ✓。種目とプランの紐付け・RIR を残して送り直せる', () => {
  const [session] = toEditSessions([{
    id: 's9', trainedOn: '2026-10-28', recordedBy: null,
    exercises: [{
      exerciseId: 'ue1', planExerciseId: 'pe1', name: 'スクワット', offPlan: false, isBodyweight: false, cardio: null,
      sets: [{ setNumber: 1, weightKg: 100, reps: 5, rir: true, isWarmup: false, durationSeconds: null, distanceKm: null, caloriesKcal: null }],
    }],
  }])
  assert.equal(session.exercises[0].sets[0].done, true)
  const payload = toSavePayload(session)
  assert.ok(payload.ok)
  assert.deepEqual(payload.sets[0], {
    exercise_id: 'ue1', plan_exercise_id: 'pe1', set_number: 1, weight_kg: 100, reps: 5, rir: true, is_warmup: false,
    duration_seconds: null, distance_km: null, calories_kcal: null,
  })
  assert.deepEqual([...recordedPlanExerciseIds([session])], ['pe1'])
  session.exercises[0].sets[0].done = false
  assert.deepEqual([...recordedPlanExerciseIds([session])], [])
})

test('セットを足す: 直前のワーキングセットの重量・回数を引き継ぐ', () => {
  const draft: EditSession = draftFromPrefill('s1', '2026-10-29', prefill())
  const added = nextSet(draft.exercises[0].sets)
  assert.deepEqual([added.weight, added.reps, added.done, added.isWarmup], ['', '8', false, false])
  assert.deepEqual([nextSet([]).weight, nextSet([]).reps], ['', ''])
})
