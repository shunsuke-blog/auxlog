// lib/record/cardio.ts のテスト（2026-10-26 有酸素運動）。実行: npx tsx --test lib/record/cardio.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCardio, formatDuration, formatPace, parseCardioInput } from './cardio'

test('時間: 60分未満は分、それ以上は時間と分', () => {
  assert.equal(formatDuration(30 * 60), '30分')
  assert.equal(formatDuration(60 * 60), '1時間')
  assert.equal(formatDuration(65 * 60), '1時間5分')
})

test('ペース: 1kmあたりの分:秒', () => {
  assert.equal(formatPace(30 * 60, 5), '6:00/km')
  assert.equal(formatPace(25 * 60, 4.2), '5:57/km')
})

test('表示: 距離・カロリーがある時だけ足す。距離は文字列（DB の numeric）でもよい', () => {
  assert.equal(formatCardio({ duration_seconds: 1800, distance_km: null, calories_kcal: null }), '30分')
  assert.equal(formatCardio({ duration_seconds: 1800, distance_km: '5.00', calories_kcal: 300 }), '30分 · 5.0km（6:00/km） · 300kcal')
  assert.equal(formatCardio({ duration_seconds: null, distance_km: null, calories_kcal: null }), '')
})

test('入力: 時間は必須、距離・カロリーは空なら null', () => {
  assert.deepEqual(parseCardioInput({ minutes: '30', distanceKm: '', calories: '' }), { duration_seconds: 1800, distance_km: null, calories_kcal: null })
  assert.deepEqual(parseCardioInput({ minutes: '30', distanceKm: '5.123', calories: '300' }), { duration_seconds: 1800, distance_km: 5.12, calories_kcal: 300 })
  assert.equal(parseCardioInput({ minutes: '', distanceKm: '5', calories: '' }), null)
})

test('入力: 範囲外・不正な値は null（DB の制約と同じ範囲）', () => {
  assert.equal(parseCardioInput({ minutes: '0', distanceKm: '', calories: '' }), null)
  assert.equal(parseCardioInput({ minutes: '1441', distanceKm: '', calories: '' }), null)
  assert.equal(parseCardioInput({ minutes: '30', distanceKm: '0', calories: '' }), null)
  assert.equal(parseCardioInput({ minutes: '30', distanceKm: '', calories: '12.5' }), null)
  assert.equal(parseCardioInput({ minutes: 'abc', distanceKm: '', calories: '' }), null)
})
