// 実行: npx tsx --test lib/suggest/recent_activity.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRecentActivity } from './recent_activity'
import type { TrainingSet } from '@/types'

function makeSet(partial: Partial<TrainingSet> & Pick<TrainingSet, 'exercise_id' | 'session_id'>): TrainingSet {
  return {
    id: `set-${Math.random()}`,
    set_number: 1,
    weight_kg: 60,
    reps: 8,
    rir: false,
    is_warmup: false,
    created_at: '2026-01-01',
    ...partial,
  }
}

test('recentSetsByExercise: 種目ごとに最新セッションの非ウォームアップセットだけを集める', () => {
  const trainedAt = new Map([
    ['s-old', '2026-08-01'],
    ['s-new', '2026-08-05'],
  ])
  const sets = [
    makeSet({ exercise_id: 'ex1', session_id: 's-old', weight_kg: 50 }),
    makeSet({ exercise_id: 'ex1', session_id: 's-new', weight_kg: 55 }),
    makeSet({ exercise_id: 'ex1', session_id: 's-new', is_warmup: true, weight_kg: 20 }),
  ]
  const { recentSetsByExercise } = buildRecentActivity(sets, trainedAt, new Map())
  assert.deepEqual(
    recentSetsByExercise['ex1'].map(s => s.weight_kg),
    [55],
    '最新セッション(s-new)の非ウォームアップセットだけが残るはず'
  )
})

test('recentWarmupSetsByPattern: 直近セッションのウォームアップセットを重量・回数ごと返す', () => {
  const trainedAt = new Map([['s1', '2026-08-05']])
  const sets = [
    makeSet({ exercise_id: 'ex1', session_id: 's1', is_warmup: true, weight_kg: 40, reps: 5 }),
    makeSet({ exercise_id: 'ex1', session_id: 's1', is_warmup: false }),
  ]
  const exerciseIdsByPattern = new Map([['horizontal_press', ['ex1']]])
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, exerciseIdsByPattern)
  assert.deepEqual(
    recentWarmupSetsByPattern['horizontal_press'].map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
    [{ weight_kg: 40, reps: 5 }]
  )
})

test('recentWarmupSetsByPattern: 直近セッションにウォームアップが無ければキー自体が立たない', () => {
  const trainedAt = new Map([['s1', '2026-08-05']])
  const sets = [makeSet({ exercise_id: 'ex1', session_id: 's1', is_warmup: false })]
  const exerciseIdsByPattern = new Map([['horizontal_press', ['ex1']]])
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, exerciseIdsByPattern)
  assert.equal(recentWarmupSetsByPattern['horizontal_press'], undefined)
})

test('recentWarmupSetsByPattern: 種目を変えても同じ動きパターンなら直近記録(重量・回数込み)を引き継ぐ', () => {
  // 週1はバーベルベンチプレス(ex-bb)でウォームアップあり、週2はダンベルベンチプレス(ex-db)に
  // 変えたが同じhorizontal_pressパターンなので、ex-dbの提案にも引き継がれるべき。
  const trainedAt = new Map([
    ['s-week1', '2026-08-01'],
    ['s-week2', '2026-08-08'],
  ])
  const sets = [
    makeSet({ exercise_id: 'ex-bb', session_id: 's-week1', is_warmup: true, weight_kg: 30, reps: 8 }),
    makeSet({ exercise_id: 'ex-bb', session_id: 's-week1', is_warmup: false }),
  ]
  const exerciseIdsByPattern = new Map([['horizontal_press', ['ex-bb', 'ex-db']]])
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, exerciseIdsByPattern)
  assert.deepEqual(
    recentWarmupSetsByPattern['horizontal_press'].map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
    [{ weight_kg: 30, reps: 8 }]
  )
})

test('直近セッションでウォームアップをやめたら、次はウォームアップ無しに切り替わる', () => {
  const trainedAt = new Map([
    ['s-week1', '2026-08-01'],
    ['s-week2', '2026-08-08'],
  ])
  const sets = [
    makeSet({ exercise_id: 'ex1', session_id: 's-week1', is_warmup: true }),
    makeSet({ exercise_id: 'ex1', session_id: 's-week2', is_warmup: false }),
  ]
  const exerciseIdsByPattern = new Map([['horizontal_press', ['ex1']]])
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, exerciseIdsByPattern)
  assert.equal(recentWarmupSetsByPattern['horizontal_press'], undefined, '直近(week2)を見るので古い週1の実施は無視されるはず')
})

test('複数セット記録していれば、set_number順にすべて引き継がれる', () => {
  const trainedAt = new Map([['s1', '2026-08-05']])
  const sets = [
    makeSet({ exercise_id: 'ex1', session_id: 's1', is_warmup: true, set_number: 2, weight_kg: 60, reps: 3 }),
    makeSet({ exercise_id: 'ex1', session_id: 's1', is_warmup: true, set_number: 1, weight_kg: 40, reps: 5 }),
  ]
  const exerciseIdsByPattern = new Map([['horizontal_press', ['ex1']]])
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, exerciseIdsByPattern)
  assert.equal(recentWarmupSetsByPattern['horizontal_press'].length, 2, 'ウォームアップセットは全件保持される')
})

test('動きパターンに属さない種目のセットは無視される', () => {
  const trainedAt = new Map([['s1', '2026-08-05']])
  const sets = [makeSet({ exercise_id: 'ex-unrelated', session_id: 's1', is_warmup: true })]
  const { recentWarmupSetsByPattern } = buildRecentActivity(sets, trainedAt, new Map())
  assert.deepEqual(recentWarmupSetsByPattern, {})
})
