import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcBadge } from './badge'

const set = (weight: string, reps: string, done = true) => ({ set_number: 1, weight_kg: weight, reps, rir: true, is_warmup: false, done })

test('calcBadge: 全セットをチェックした時だけ、重量が上回れば重量アップ、同じ重量で回数なら回数アップ、総挙上量なら総挙上量アップ', () => {
  const prev = { weight: 80, reps: 5, volume: 1200, totalReps: 15 }
  assert.equal(calcBadge([set('80', '5'), set('80', '5', false)], false, prev), null)
  assert.equal(calcBadge([set('82.5', '5')], true, prev), 'weight_up')
  assert.equal(calcBadge([set('80', '6')], true, prev), 'reps_up')
  // 重量を上げて回数が減り、総挙上量が前回より少なくても「重量アップ」（何が上がったかを書く、2026-11-10）
  assert.equal(calcBadge([set('94', '8'), set('94', '7'), set('94', '6')], true, { weight: 89, reps: 10, volume: 2670 }), 'weight_up')
  assert.equal(calcBadge([set('80', '5'), set('80', '5'), set('80', '5'), set('70', '5')], true, prev), 'volume_up')
  assert.equal(calcBadge([set('70', '5')], true, prev), 'done')
  // 初めての種目（前回の記録なし）は GOOD
  assert.equal(calcBadge([set('80', '5')], true, undefined), 'done')
})
