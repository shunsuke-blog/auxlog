import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExerciseCategories } from '@/lib/suggest/generate_program_composition'
import { distributeTemplateDays, fitDaysToSession, planWeeks, MAX_CONSECUTIVE_HARD_WEEKS, MAX_EXERCISES_PER_DAY } from './generate_template'

const isHard = (phase: string) => phase === 'volume' || phase === 'intensity'

test('planWeeks: 9週は既存のセルフモードと同じ構成（W1〜7 → W8回復 → W9 MaxOut）', () => {
  const plan = planWeeks(9)
  assert.deepEqual(plan.map(w => w.sourceWeek), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(plan.map(w => w.phase), ['volume', 'volume', 'volume', 'volume', 'intensity', 'intensity', 'intensity', 'deload', 'maxout'])
})

test('planWeeks: 1〜16週すべてで週数・最終週・回復週・連続の上限を満たす', () => {
  for (let n = 1; n <= 16; n++) {
    const plan = planWeeks(n)
    assert.equal(plan.length, n, `${n}週`)
    assert.deepEqual(plan.map(w => w.week), Array.from({ length: n }, (_, i) => i + 1))
    if (n >= 4) assert.equal(plan[n - 1].phase, 'maxout', `${n}週: 最終週はMaxOut`)
    if (n >= 6) assert.equal(plan[n - 2].phase, 'deload', `${n}週: MaxOutの前は回復週`)
    let run = 0
    for (const w of plan) {
      run = isHard(w.phase) ? run + 1 : 0
      assert.ok(run <= MAX_CONSECUTIVE_HARD_WEEKS, `${n}週: 負荷の高い週が${run}週連続`)
    }
    // ボリューム期は強度期より前にしか来ない
    const firstIntensity = plan.findIndex(w => w.phase === 'intensity')
    if (firstIntensity >= 0) assert.ok(!plan.slice(firstIntensity).some(w => w.phase === 'volume'), `${n}週: 強度期の後にボリューム期`)
  }
})

test('planWeeks: 12週は途中にも回復週が入る', () => {
  const phases = planWeeks(12).map(w => w.phase)
  assert.equal(phases.filter(p => p === 'deload').length, 2)
})

const categories = buildExerciseCategories(4, [])
const groupOf = (id: string, muscle: string) =>
  id === 'calves' ? 'calves' : muscle === 'legs' ? 'legs' : muscle === 'core' ? 'core' : muscle === 'back' || id.startsWith('biceps') ? 'pull' : 'push'

for (const days of [5, 6, 7]) {
  test(`distributeTemplateDays: 週${days}日でも全種目を1回ずつ配置し、同じ系統を連日にしない`, () => {
    const dist = distributeTemplateDays(days, categories)
    const placed = [...dist.values()].flat()
    assert.equal(placed.length, categories.length)
    assert.equal(new Set(placed.map(c => c.id)).size, categories.length)
    for (const group of ['push', 'pull', 'legs']) {
      const groupDays = [...dist.entries()].filter(([, cs]) => cs.some(c => groupOf(c.id, c.muscle) === group)).map(([d]) => d).sort()
      for (let i = 1; i < groupDays.length; i++) {
        assert.ok(groupDays[i] - groupDays[i - 1] >= 2, `週${days}日: ${group} が Day${groupDays[i - 1]} と Day${groupDays[i]} で連日`)
      }
    }
  })
}

test('distributeTemplateDays: 週7日の7日目は体幹・カーフだけで、腕は入らない', () => {
  const day7 = distributeTemplateDays(7, categories).get(7) ?? []
  assert.ok(day7.length > 0)
  assert.ok(day7.every(c => c.muscle === 'core' || c.id === 'calves'))
})

// 改定ルール①（2026-10-22）: 三頭は押す日、二頭は引く日、体幹は脚の日だけ
const PRIORITY_COMBOS: string[][] = [[], ['chest'], ['biceps', 'triceps'], ['legs', 'core'], ['back', 'shoulders']]
const muscleDays = (dist: Map<number, { id: string; muscle: string }[]>, pred: (c: { id: string; muscle: string }) => boolean) =>
  new Set([...dist.entries()].filter(([, list]) => list.some(pred)).map(([d]) => d))
const isPush = (c: { id: string; muscle: string }) => c.muscle === 'chest' || c.muscle === 'shoulders'
const isPull = (c: { id: string; muscle: string }) => c.muscle === 'back'
const isTriceps = (c: { id: string }) => c.id.startsWith('triceps')
const isBiceps = (c: { id: string }) => c.id.startsWith('biceps')
const isLegs = (c: { id: string; muscle: string }) => c.muscle === 'legs'

test('distributeTemplateDays: 週4〜6日は三頭＝押す日、二頭＝引く日、体幹＝脚の日だけ（改定ルール①）', () => {
  for (const days of [4, 5, 6]) {
    for (const p of PRIORITY_COMBOS) {
      const dist = distributeTemplateDays(days, buildExerciseCategories(4, p as never))
      const push = muscleDays(dist, isPush), pull = muscleDays(dist, isPull), legs = muscleDays(dist, isLegs)
      for (const d of muscleDays(dist, isTriceps)) assert.ok(push.has(d), `週${days}日 ${p}: 三頭がDay${d}（押す日でない）`)
      for (const d of muscleDays(dist, isBiceps)) assert.ok(pull.has(d), `週${days}日 ${p}: 二頭がDay${d}（引く日でない）`)
      for (const d of muscleDays(dist, c => c.muscle === 'core')) assert.ok(legs.has(d), `週${days}日 ${p}: 体幹がDay${d}（脚の日でない）`)
    }
  }
  // 週4日は腕を下半身の日（Day2・4）に入れない
  const dist4 = distributeTemplateDays(4, buildExerciseCategories(4, []))
  for (const d of [2, 4]) assert.ok(!dist4.get(d)!.some(c => c.muscle === 'arms'), `週4日 Day${d} に腕`)
})

test('fitDaysToSession: 1日の種目数を時間の上限に収め、重いメイン種目は外さず、体幹は最後（改定ルール①②）', () => {
  for (const days of [2, 3, 4, 5, 6, 7]) {
    for (const p of PRIORITY_COMBOS) {
      const base = days >= 4 ? 4 : days
      const categories = buildExerciseCategories(base as never, p as never)
      const dist = distributeTemplateDays(days, categories)
      for (const minutes of [60, 75, 90] as const) {
        const fitted = fitDaysToSession(dist, categories, minutes)
        for (const [d, list] of fitted) {
          const before = dist.get(d)!
          const mainCount = before.filter(c => c.isSixPattern).length
          assert.ok(list.length <= Math.max(MAX_EXERCISES_PER_DAY[minutes], mainCount), `週${days}日 ${minutes}分 Day${d}: ${list.length}種目`)
          assert.equal(list.filter(c => c.isSixPattern).length, mainCount, `週${days}日 ${minutes}分 Day${d}: メイン種目が外れた`)
          const firstCore = list.findIndex(c => c.muscle === 'core')
          if (firstCore >= 0) assert.ok(list.slice(firstCore).every(c => c.muscle === 'core'), `週${days}日 Day${d}: 体幹の後に別の種目`)
          // 外すのは順位の低い種目から（残った種目は、外した種目より必ず順位が高い）
          const rank = new Map(categories.map((c, i) => [c.id, i]))
          const removed = before.filter(c => !list.includes(c))
          for (const r of removed) {
            for (const k of list.filter(c => !c.isSixPattern)) assert.ok(rank.get(k.id)! < rank.get(r.id)!, `週${days}日 ${minutes}分 Day${d}: ${k.id} より順位の高い ${r.id} を外した`)
          }
        }
      }
    }
  }
})
