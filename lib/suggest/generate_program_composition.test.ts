// generate_program_composition.ts の自動テスト。
// .company/engineering/docs/program-composition-redesign-brainstorm.md で手作業で検証した
// シナリオ（#11 胸priority、#12・#14 二頭+三頭priority）と一致することを確認する。
//
// 実行: npx tsx --test lib/suggest/generate_program_composition.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExerciseCategories, distributeToDays, setsForNonPatternCategory } from './generate_program_composition'

function ids(categories: { id: string }[]): string[] {
  return categories.map(c => c.id)
}

test('priorityなし・2日 => base9 + 脚デフォルト = 10種目', () => {
  const result = buildExerciseCategories(2, [])
  assert.equal(result.length, 10)
  assert.equal(result[9].id, 'leg_default')
})

test('priorityなし・3日 => 18種目（11番目は省略、借りてこない。2026-08-21 leg_curl追加で17→18）', () => {
  const result = buildExerciseCategories(3, [])
  assert.equal(result.length, 18)
})

test('priority=[chest]・2日 => 10種目のまま（priority1のみでは+1されない）', () => {
  const result = buildExerciseCategories(2, ['chest'])
  assert.equal(result.length, 10)
  assert.equal(result[9].id, 'chest_fly')
})

test('priority=[chest]・3日 => 18種目（胸2種目目がスキップされ通常19より1つ少ない。2026-08-21 leg_curl追加で17→18）', () => {
  const result = buildExerciseCategories(3, ['chest'])
  assert.equal(result.length, 18)
  // 胸フライがpriorityとして1回だけ登場し、chest_flyの重複がないこと
  assert.equal(ids(result).filter(id => id === 'chest_fly').length, 1)
})

test('priority=[chest]・4日 => 部位上限を反映した種目数になる', () => {
  const result = buildExerciseCategories(4, ['chest'])
  const chestCount = result.filter(c => c.muscle === 'chest').length
  assert.ok(chestCount <= 4, `胸の種目数が上限4を超えている: ${chestCount}`)
})

test('priority=[biceps, triceps]・2日 => 11種目（priority2選択で+1拡張）', () => {
  const result = buildExerciseCategories(2, ['biceps', 'triceps'])
  assert.equal(result.length, 11)
  assert.equal(result[9].id, 'biceps_2')
  assert.equal(result[10].id, 'triceps_2')
})

test('priority=[biceps, triceps]・3日 => 17種目（両方スキップされ通常19より2つ少ない。2026-08-21 leg_curl追加で16→17）', () => {
  const result = buildExerciseCategories(3, ['biceps', 'triceps'])
  assert.equal(result.length, 17)
})

test('priority=[biceps, triceps]・4日 => 腕の種目数は合算で上限4を超えない', () => {
  const result = buildExerciseCategories(4, ['biceps', 'triceps'])
  const armsCount = result.filter(c => c.muscle === 'arms').length
  assert.ok(armsCount <= 4, `腕の種目数が上限4を超えている: ${armsCount}`)
})

test('priority=[shoulders]・3日 => 肩側方が重複しない（当初「スキップなし」としていた誤りの訂正確認）', () => {
  const result = buildExerciseCategories(3, ['shoulders'])
  assert.equal(ids(result).filter(id => id === 'shoulder_lateral').length, 1)
})

test('priority=[biceps, triceps]・4日 => rank25のleg_3が失われない（2026-08-21 leg_curl追加でcanonical順位が24→25に伸びた際の回帰: buildFullSequenceのループ上限を24のまま放置するとrank25が生成されずleg_3が消える）', () => {
  const result = buildExerciseCategories(4, ['biceps', 'triceps'])
  assert.ok(ids(result).includes('leg_3'), 'leg_3が含まれていない')
})

test('どの部位も脚を除き4種目、脚は6種目を超えない（全priorityパターン×全日数で網羅確認。2026-08-21 leg_curl追加でcap 5→6）', () => {
  const priorityOptions: Array<'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core'> =
    ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core']
  const days: Array<2 | 3 | 4> = [2, 3, 4]

  for (const d of days) {
    for (const p1 of [undefined, ...priorityOptions]) {
      for (const p2 of [undefined, ...priorityOptions]) {
        const priorities = [p1, p2].filter((p): p is NonNullable<typeof p> => p != null)
        const result = buildExerciseCategories(d, priorities)
        const counts = new Map<string, number>()
        for (const c of result) counts.set(c.muscle, (counts.get(c.muscle) ?? 0) + 1)
        for (const [muscle, count] of counts) {
          const cap = muscle === 'legs' ? 6 : 4
          assert.ok(count <= cap, `days=${d} priorities=${priorities} muscle=${muscle} count=${count} exceeds cap=${cap}`)
        }
      }
    }
  }
})

test('leg_curl: 週2日は含まれず、週3日・4日には含まれる（2026-08-21追加、既知課題「レッグカールが全パターンでゼロ」対応）', () => {
  assert.equal(ids(buildExerciseCategories(2, [])).includes('leg_curl'), false)
  assert.equal(ids(buildExerciseCategories(3, [])).includes('leg_curl'), true)
  assert.equal(ids(buildExerciseCategories(4, [])).includes('leg_curl'), true)
})

test('setsForNonPatternCategory: 60分=2, 75分=3, 90分=4', () => {
  assert.equal(setsForNonPatternCategory(60), 2)
  assert.equal(setsForNonPatternCategory(75), 3)
  assert.equal(setsForNonPatternCategory(90), 4)
})

test('distributeToDays: 2日は6パターンが3+3に割れ、全カテゴリが漏れなく配分される', () => {
  const categories = buildExerciseCategories(2, ['chest'])
  const dayMap = distributeToDays(2, categories)
  const totalAssigned = [...dayMap.values()].reduce((sum, arr) => sum + arr.length, 0)
  assert.equal(totalAssigned, categories.length)
  assert.equal(dayMap.get(1)!.length, 5)
  assert.equal(dayMap.get(2)!.length, 5)
})

test('distributeToDays: 4日は概ね均等に配分される（差は1以内）', () => {
  const categories = buildExerciseCategories(4, ['chest'])
  const dayMap = distributeToDays(4, categories)
  const counts = [...dayMap.values()].map(arr => arr.length)
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  assert.ok(max - min <= 1, `日ごとの種目数の差が大きすぎる: ${counts.join(',')}`)
})

test('distributeToDays: 3日は主要筋（胸・背中・脚）がそれぞれ2日以上に分散配置される（実装依頼書 要件2、2026-08-27。旧実装は実質PPLで各筋1回/週だった）', () => {
  const categories = buildExerciseCategories(3, [])
  const dayMap = distributeToDays(3, categories)

  const totalAssigned = [...dayMap.values()].reduce((sum, arr) => sum + arr.length, 0)
  assert.equal(totalAssigned, categories.length, '全カテゴリが漏れなく配分されるはず（総数は変えない）')

  const daysByMuscle = new Map<string, Set<number>>()
  for (const [day, cats] of dayMap) {
    for (const c of cats) {
      if (!daysByMuscle.has(c.muscle)) daysByMuscle.set(c.muscle, new Set())
      daysByMuscle.get(c.muscle)!.add(day)
    }
  }

  for (const muscle of ['chest', 'back', 'legs']) {
    const days = daysByMuscle.get(muscle)?.size ?? 0
    assert.ok(days >= 2, `${muscle}は2日以上に登場するはず（実際: ${days}日）`)
  }
})

test('distributeToDays: 3日は1日あたりの脚カテゴリ数が過度に集中しない（旧実装はLegs日に脚5種目が集中していた）', () => {
  const categories = buildExerciseCategories(3, [])
  const dayMap = distributeToDays(3, categories)
  for (const [day, cats] of dayMap) {
    const legCount = cats.filter(c => c.muscle === 'legs').length
    assert.ok(legCount <= 3, `Day${day}の脚カテゴリ数が多すぎる: ${legCount}`)
  }
})

test('distributeToDays: 3日の日ごとのカテゴリ数は概ね均等（差は2以内）', () => {
  const categories = buildExerciseCategories(3, [])
  const dayMap = distributeToDays(3, categories)
  const counts = [...dayMap.values()].map(arr => arr.length)
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  assert.ok(max - min <= 2, `日ごとの種目数の差が大きすぎる: ${counts.join(',')}`)
})
