import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcBadge } from './badge'

const set = (weight: string, reps: string, done = true) => ({ set_number: 1, weight_kg: weight, reps, rir: true, is_warmup: false, done })

test('calcBadge: 全セットをチェックした時だけ、重量（同じなら回数）が上回れば Record、総挙上量なら Vol Up', () => {
  const prev = { weight: 80, reps: 5, volume: 1200, totalReps: 15 }
  assert.equal(calcBadge([set('80', '5'), set('80', '5', false)], false, prev), null)
  assert.equal(calcBadge([set('82.5', '5')], true, prev), 'record')
  assert.equal(calcBadge([set('80', '6')], true, prev), 'record')
  assert.equal(calcBadge([set('80', '5'), set('80', '5'), set('80', '5'), set('70', '5')], true, prev), 'volume_up')
  assert.equal(calcBadge([set('70', '5')], true, prev), 'done')
  // 初めての種目（前回の記録なし）は GOOD
  assert.equal(calcBadge([set('80', '5')], true, undefined), 'done')
})
