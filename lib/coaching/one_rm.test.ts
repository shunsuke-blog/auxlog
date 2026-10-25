// lib/coaching/one_rm.ts のテスト（2026-10-25 レビュー対応）。実行: npx tsx --test lib/coaching/one_rm.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateOneRmFromSets, isUsableForEstimate, roundToPlate, MAX_PLAUSIBLE_KG } from './one_rm'

test('Epley: 重量×(1+回数/30)、1回なら重量そのもの', () => {
  assert.equal(estimateOneRmFromSets([{ weight_kg: 80, reps: 6 }]), 96)
  assert.equal(estimateOneRmFromSets([{ weight_kg: 100, reps: 1 }]), 100)
  assert.equal(estimateOneRmFromSets([{ weight_kg: 60, reps: 12 }]), 84)
})

test('回数の境界: 12回は使う、13回・0回は使わない', () => {
  assert.equal(isUsableForEstimate({ weight_kg: 60, reps: 12 }), true)
  assert.equal(isUsableForEstimate({ weight_kg: 60, reps: 13 }), false)
  assert.equal(isUsableForEstimate({ weight_kg: 60, reps: 0 }), false)
  assert.equal(estimateOneRmFromSets([{ weight_kg: 100, reps: 13 }, { weight_kg: 100, reps: 0 }]), null)
})

test('重量の異常値: 0・マイナス・500kg超は使わない、500kgちょうどは使う', () => {
  assert.equal(isUsableForEstimate({ weight_kg: 0, reps: 5 }), false)
  assert.equal(isUsableForEstimate({ weight_kg: -50, reps: 5 }), false)
  assert.equal(isUsableForEstimate({ weight_kg: 500.5, reps: 5 }), false)
  assert.equal(isUsableForEstimate({ weight_kg: 999, reps: 5 }), false)
  assert.equal(isUsableForEstimate({ weight_kg: 500, reps: 1 }), true)
})

test('推定1RMは500kgを超えない', () => {
  assert.equal(estimateOneRmFromSets([{ weight_kg: 450, reps: 10 }]), MAX_PLAUSIBLE_KG)
})

test('ウォームアップは使わない。複数セットは推定値の最大', () => {
  assert.equal(estimateOneRmFromSets([{ weight_kg: 200, reps: 3, is_warmup: true }]), null)
  assert.equal(estimateOneRmFromSets([{ weight_kg: 80, reps: 6 }, { weight_kg: 90, reps: 3 }]), 99)
})

test('2.5kg単位の丸め（DB の round_to_plate と同じ）', () => {
  assert.equal(roundToPlate(76.8), 77.5)
  assert.equal(roundToPlate(78.72), 77.5)
  assert.equal(roundToPlate(78.76), 80)
  assert.equal(roundToPlate(76.24), 75)
  assert.equal(roundToPlate(0), 0)
})
