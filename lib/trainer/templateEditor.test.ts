// lib/trainer/templateEditor.ts のテスト（2026-10-26 有酸素運動をプログラムに入れる）。実行: npx tsx --test lib/trainer/templateEditor.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exerciseIdOf, isCardioExercise, toEditorExercises, toSavePayload, type EditorExercise, type PlanExerciseRow } from './templateEditor'

const cardio = (patch: Partial<EditorExercise> = {}): EditorExercise => ({
  key: 'k1', exerciseMasterId: null, trainerExerciseId: null, cardioMasterId: 'c1', name: 'ランニング', targetMuscle: 'cardio',
  note: '', sets: [], targetMinutes: '30', targetDistanceKm: '', ...patch,
})

test('有酸素の判定: 有酸素の一覧の種目、または部位が有酸素の独自種目', () => {
  assert.equal(isCardioExercise({ cardioMasterId: 'c1', targetMuscle: null }), true)
  assert.equal(isCardioExercise({ cardioMasterId: null, targetMuscle: 'cardio' }), true)
  assert.equal(isCardioExercise({ cardioMasterId: null, targetMuscle: 'chest' }), false)
})

test('種目のキー: 一覧の種目・独自種目・有酸素で別々', () => {
  assert.equal(exerciseIdOf({ exerciseMasterId: 'm1', trainerExerciseId: null }), 'm:m1')
  assert.equal(exerciseIdOf({ exerciseMasterId: null, trainerExerciseId: 't1' }), 't:t1')
  assert.equal(exerciseIdOf({ exerciseMasterId: null, trainerExerciseId: null, cardioMasterId: 'c1' }), 'c:c1')
})

test('保存: 有酸素はセットの代わりに目標の時間（秒）と距離', () => {
  const r = toSavePayload([cardio({ targetDistanceKm: '5.123' })])
  assert.ok(r.ok)
  assert.deepEqual(r.exercises[0], {
    exercise_master_id: null, trainer_exercise_id: null, cardio_master_id: 'c1', note: null,
    target_duration_seconds: 1800, target_distance_km: 5.12, sets: [],
  })
})

test('保存: 有酸素の時間が空・範囲外なら保存させない', () => {
  assert.equal(toSavePayload([cardio({ targetMinutes: '' })]).ok, false)
  assert.equal(toSavePayload([cardio({ targetMinutes: '2000' })]).ok, false)
  assert.equal(toSavePayload([cardio({ targetDistanceKm: '0' })]).ok, false)
})

test('読み込み: DB の行から有酸素の目標を分・km の入力に戻す', () => {
  const row: PlanExerciseRow = {
    sort_order: 1, note: null, exercise_master_id: null, trainer_exercise_id: null, cardio_master_id: 'c1',
    target_duration_seconds: 1800, target_distance_km: '5.00', exercise_master: null, trainer_exercises: null,
    cardio_master: { name: 'ランニング' }, plan_sets: [],
  }
  const [ex] = toEditorExercises([row])
  assert.equal(ex.name, 'ランニング')
  assert.equal(ex.targetMuscle, 'cardio')
  assert.equal(ex.targetMinutes, '30')
  assert.equal(ex.targetDistanceKm, '5')
})
