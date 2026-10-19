import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExerciseCategories } from '@/lib/suggest/generate_program_composition'
import { distributeTemplateDays, planWeeks, MAX_CONSECUTIVE_HARD_WEEKS } from './generate_template'

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
