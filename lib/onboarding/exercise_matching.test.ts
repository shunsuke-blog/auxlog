// lib/onboarding/exercise_matching.ts の自動テスト。
// 2026-07-09、OnboardingClient.tsxからロジックを切り出した際に追加。
// (a)(b)はバーベルカールが三頭2種目目に誤割当されていた実バグの回帰テスト。
//
// 実行: npx tsx --test lib/onboarding/exercise_matching.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchingExercises,
  exerciseRequiresOneRm,
  buildSlotSelections,
  type ExerciseMasterRow,
} from './exercise_matching'
import { BASE_CATEGORIES_BY_RANK } from '@/lib/constants/program_composition'

const biceps1 = BASE_CATEGORIES_BY_RANK.get(8)!  // 二頭
const triceps2 = BASE_CATEGORIES_BY_RANK.get(18)! // 三頭2種目目
const shoulderRearDelt = BASE_CATEGORIES_BY_RANK.get(12)! // 肩後部
const shoulderLateral = BASE_CATEGORIES_BY_RANK.get(13)!  // 肩側方
const shoulderPress = BASE_CATEGORIES_BY_RANK.get(2)! // バーチカルプレス(6パターン)
const leg2 = BASE_CATEGORIES_BY_RANK.get(16)! // 脚2種目目（スクワット or ヒップヒンジ）

function ex(name: string, target_muscle: string, movement_pattern: string, requires_one_rm = false): ExerciseMasterRow {
  return { id: name, name, target_muscle, movement_pattern, requires_one_rm }
}

const barbellCurl = ex('バーベルカール', 'arms', 'elbow_flexion')
const dumbbellCurl = ex('ダンベルカール', 'arms', 'elbow_flexion')
const lyingTricepsEx = ex('ライイングトライセプスEX', 'arms', 'elbow_extension')
const tricepsPushdown = ex('トライセプスプレスダウン', 'arms', 'elbow_extension')
const rearDeltFly = ex('リバースペックフライ', 'shoulders', 'shoulder_horizontal_abduction')
const lateralRaise = ex('サイドレイズ', 'shoulders', 'shoulder_abduction')

test('matchingExercises: 三頭カテゴリの候補に二頭種目(バーベルカール)が混ざらない(回帰テスト)', () => {
  const exercises = [barbellCurl, dumbbellCurl, lyingTricepsEx, tricepsPushdown]
  const candidates = matchingExercises(triceps2, exercises)
  assert.ok(!candidates.some(c => c.name === 'バーベルカール'), 'バーベルカールが三頭候補に含まれてはいけない')
  assert.deepEqual(candidates.map(c => c.name).sort(), ['トライセプスプレスダウン', 'ライイングトライセプスEX'])
})

test('matchingExercises: 二頭カテゴリの候補に三頭種目が混ざらない', () => {
  const exercises = [barbellCurl, dumbbellCurl, lyingTricepsEx, tricepsPushdown]
  const candidates = matchingExercises(biceps1, exercises)
  assert.deepEqual(candidates.map(c => c.name).sort(), ['ダンベルカール', 'バーベルカール'])
})

test('matchingExercises: 肩側方/後部も同じ部位内で動きパターンごとに分離される', () => {
  const exercises = [rearDeltFly, lateralRaise]
  assert.deepEqual(matchingExercises(shoulderRearDelt, exercises).map(c => c.name), ['リバースペックフライ'])
  assert.deepEqual(matchingExercises(shoulderLateral, exercises).map(c => c.name), ['サイドレイズ'])
})

test('matchingExercises: 6パターンカテゴリも動きパターンで絞り込む', () => {
  const exercises = [ex('オーバーヘッドプレス', 'shoulders', 'vertical_press'), rearDeltFly]
  assert.deepEqual(matchingExercises(shoulderPress, exercises).map(c => c.name), ['オーバーヘッドプレス'])
})

test('matchingExercises: movementPatternが配列指定のカテゴリ(脚2種目目)はいずれかに一致すればよい(回帰テスト)', () => {
  // brainstorm #10「脚2種目目（スクワット or ヒンジ）」。2026-07-10、動きパターン厳密化の際に
  // 誤って単一パターン(squatのみ)に制限してしまい、ヒップスラスト等のヒンジ系種目が
  // 選べなくなっていたバグの修正
  const highBarSquat = ex('ハイバースクワット', 'legs', 'squat', true)
  const hipThrust = ex('ヒップスラスト', 'legs', 'hip_hinge', false)
  const legPress = ex('レッグプレス', 'legs', 'squat', true)
  const benchPress = ex('ベンチプレス', 'chest', 'horizontal_press', true)
  const candidates = matchingExercises(leg2, [highBarSquat, hipThrust, legPress, benchPress])
  assert.deepEqual(candidates.map(c => c.name).sort(), ['ハイバースクワット', 'ヒップスラスト', 'レッグプレス'])
})

test('exerciseRequiresOneRm: 種目のrequires_one_rmを反映する', () => {
  const deadlift = ex('デッドリフト', 'legs', 'hip_hinge', true)
  const rdl = ex('ルーマニアンデッドリフト', 'legs', 'hip_hinge', false)
  const byName = new Map([[deadlift.name, deadlift], [rdl.name, rdl]])
  const legHinge = BASE_CATEGORIES_BY_RANK.get(6)! // ヒップヒンジ
  assert.equal(exerciseRequiresOneRm(legHinge, 'デッドリフト', byName, 4), true)
  assert.equal(exerciseRequiresOneRm(legHinge, 'ルーマニアンデッドリフト', byName, 4), false)
})

test('exerciseRequiresOneRm: 週2日の格下げ対象カテゴリは種目に関わらずfalse', () => {
  const overheadPress = ex('オーバーヘッドプレス', 'shoulders', 'vertical_press', true)
  const byName = new Map([[overheadPress.name, overheadPress]])
  assert.equal(exerciseRequiresOneRm(shoulderPress, 'オーバーヘッドプレス', byName, 2), false)
  assert.equal(exerciseRequiresOneRm(shoulderPress, 'オーバーヘッドプレス', byName, 4), true)
})

test('buildSlotSelections: 三頭2種目目にはデフォルトでも三頭種目が入る(回帰テスト)', () => {
  const exercises = [
    ex('バーベルベンチプレス', 'chest', 'horizontal_press', true),
    ex('オーバーヘッドプレス', 'shoulders', 'vertical_press', true),
    ex('チェストサポーテッドロウ', 'back', 'horizontal_pull'),
    ex('懸垂', 'back', 'vertical_pull'),
    ex('ハイバースクワット', 'legs', 'squat', true),
    ex('デッドリフト', 'legs', 'hip_hinge', true),
    ex('レッグレイズ', 'core', 'trunk_flexion'),
    dumbbellCurl,
    barbellCurl,
    lyingTricepsEx,
    tricepsPushdown,
  ]
  const result = buildSlotSelections({
    daysPerWeek: 3,
    priorityMuscles: [],
    exercises,
    selectedExercises: new Set(),
  })
  assert.equal(result.names['triceps_1'], 'ライイングトライセプスEX')
  assert.equal(result.names['triceps_2'], 'トライセプスプレスダウン')
  assert.notEqual(result.names['triceps_2'], 'バーベルカール')
})

test('buildSlotSelections: ユーザーが選んだ種目は優先され、userSelectedに記録される', () => {
  const exercises = [
    ex('バーベルベンチプレス', 'chest', 'horizontal_press', true),
    ex('ダンベルベンチプレス', 'chest', 'horizontal_press', true),
    ex('オーバーヘッドプレス', 'shoulders', 'vertical_press', true),
    ex('チェストサポーテッドロウ', 'back', 'horizontal_pull'),
    ex('懸垂', 'back', 'vertical_pull'),
    ex('ハイバースクワット', 'legs', 'squat', true),
    ex('デッドリフト', 'legs', 'hip_hinge', true),
    ex('レッグレイズ', 'core', 'trunk_flexion'),
    dumbbellCurl,
    tricepsPushdown,
  ]
  const result = buildSlotSelections({
    daysPerWeek: 2,
    priorityMuscles: [],
    exercises,
    selectedExercises: new Set(['ダンベルベンチプレス']),
  })
  assert.equal(result.names['chest_press'], 'ダンベルベンチプレス')
  assert.ok(result.userSelected.has('chest_press'))
  assert.ok(!result.userSelected.has('back_row'), 'ユーザーが選んでいないカテゴリはuserSelectedに含まれない')
})

test('buildSlotSelections: 同じ動きパターンを共有する2カテゴリ(二頭/二頭2種目目)に、候補が2つあれば重複させない', () => {
  const exercises = [
    ex('バーベルベンチプレス', 'chest', 'horizontal_press', true),
    ex('オーバーヘッドプレス', 'shoulders', 'vertical_press', true),
    ex('チェストサポーテッドロウ', 'back', 'horizontal_pull'),
    ex('懸垂', 'back', 'vertical_pull'),
    ex('ハイバースクワット', 'legs', 'squat', true),
    ex('デッドリフト', 'legs', 'hip_hinge', true),
    ex('レッグレイズ', 'core', 'trunk_flexion'),
    dumbbellCurl,
    ex('インクラインダンベルカール', 'arms', 'elbow_flexion'),
  ]
  // 2日・priority=biceps => base9 + 二頭2種目目(priority枠、brainstorm #12) の11種目
  const result = buildSlotSelections({
    daysPerWeek: 2,
    priorityMuscles: ['biceps'],
    exercises,
    selectedExercises: new Set(),
  })
  assert.equal(result.names['biceps_1'], 'ダンベルカール')
  assert.equal(result.names['biceps_2'], 'インクラインダンベルカール')
})
