import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeExerciseBest } from './exercise_bests'

test('computeExerciseBest: 最大重量（同じ重量なら回数）と、1回の総挙上量・総回数の最大', () => {
  assert.deepEqual(computeExerciseBest([
    { session_id: 'a', weight_kg: 80, reps: 5 }, { session_id: 'a', weight_kg: 80, reps: 6 },
    { session_id: 'b', weight_kg: 70, reps: 10 }, { session_id: 'b', weight_kg: 70, reps: 10 },
  ]), { best_weight_kg: 80, best_reps: 6, best_volume: 1400, best_total_reps: 20 })
  assert.equal(computeExerciseBest([]), null)
})
