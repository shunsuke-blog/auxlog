// lib/coaching/base_templates.ts のテスト（固定テンプレート方式、2026-10-24）
// 実行: npx tsx --test lib/coaching/base_templates.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_TEMPLATES, PRIORITY_SWAPS, TEMPLATE_SETS, applyTemplate, availableDays, resolveProgramType, type SessionMinutes, type TemplateDay } from './base_templates'
import { PRIORITY_MUSCLE_OPTION_ORDER, type PriorityMuscleOption } from '@/types'

// 種目マスタの code（本番に適用した SQL と同じ一覧）
const sql = readFileSync(join(process.cwd(), 'lib/sql/add_exercise_master_code_2026-10-24.sql'), 'utf8')
// 2026-10-24 に追加した種目（ハンギングレッグレイズ・ケーブルキックバック）
const added = ['lib/sql/add_hanging_leg_raise_cable_kickback_2026-10-24.sql', 'lib/sql/add_beginner_women_exercises_2026-10-25.sql']
  .map(f => readFileSync(join(process.cwd(), f), 'utf8')).join('\n')
const MASTER_CODES = new Set([
  ...[...sql.matchAll(/\('[^']+', '([a-z0-9_]+)'\)/g)].map(m => m[1]),
  ...[...added.matchAll(/\('[^']+', '([a-z0-9_]+)', '/g)].map(m => m[1]),
])

const opts = PRIORITY_MUSCLE_OPTION_ORDER as PriorityMuscleOption[]
const COMBOS: PriorityMuscleOption[][] = [[], ...opts.map(o => [o])]
for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) COMBOS.push([opts[i], opts[j]])
const MINUTES: SessionMinutes[] = [60, 75, 90]

const ALL_TEMPLATES = Object.values(TEMPLATE_SETS).flatMap(set => Object.values(set))
const allOutputs = () => ALL_TEMPLATES.flatMap(t =>
  MINUTES.flatMap(m => COMBOS.map(p => ({ t, m, p, days: applyTemplate(t, m, p) }))))

test('テンプレートと差し替え先の種目は、すべて種目マスタの code にある', () => {
  assert.ok(MASTER_CODES.size === 89, `code の一覧を読めていない（${MASTER_CODES.size}件）`)
  for (const t of ALL_TEMPLATES) for (const d of t.days) for (const e of d.exercises) assert.ok(MASTER_CODES.has(e.code), `${t.daysPerWeek}日 ${e.code}`)
  for (const out of allOutputs()) for (const d of out.days) for (const e of d.exercises) assert.ok(MASTER_CODES.has(e.code), `差し替え ${e.code}`)
})

const has = (d: TemplateDay, muscles: string[]) => d.exercises.some(e => muscles.includes(e.muscle))

test('三頭は押す日、二頭は引く日、体幹はその日の最後（改定ルール①）。同じ日に同じ種目を2回入れない', () => {
  for (const { t, m, p, days } of allOutputs()) {
    for (const d of days) {
      const label = `${t.daysPerWeek}日 ${m}分 [${p}] Day${d.day}`
      // リカバリーの日（週7日の Day7）は、腕のパンプを押す・引く種目なしで入れる（テンプレートの指定）
      if (d.kind !== 'recovery') {
        if (has(d, ['triceps'])) assert.ok(has(d, ['chest', 'shoulders']), `${label}: 三頭があるのに押す種目が無い`)
        if (has(d, ['biceps'])) assert.ok(has(d, ['back']), `${label}: 二頭があるのに背中が無い`)
      }
      const firstCore = d.exercises.findIndex(e => e.muscle === 'core')
      if (firstCore >= 0) assert.ok(d.exercises.slice(firstCore).every(e => e.muscle === 'core'), `${label}: 体幹の後に別の種目`)
      const codes = d.exercises.map(e => e.code)
      assert.equal(new Set(codes).size, codes.length, `${label}: 同じ種目が2回 ${codes}`)
    }
  }
})

test('時間で絞る: 選んだ時間より大きい minMinutes の種目は入らない（重点部位を除く）', () => {
  // 重点部位なしでは、元のテンプレートの minMinutes どおりに絞られる
  for (const t of ALL_TEMPLATES) {
    for (const m of MINUTES) {
      const days = applyTemplate(t, m, [])
      t.days.forEach((d, i) => assert.deepEqual(
        days[i].exercises.map(e => e.code).sort(),
        d.exercises.filter(e => e.minMinutes <= m).map(e => e.code).sort(),
        `${t.daysPerWeek}日 ${m}分 Day${d.day}`,
      ))
    }
  }
})

test('重点部位の種目は〜60分でも残る（改定ルール③ Priority Override）', () => {
  for (const t of ALL_TEMPLATES) {
    for (const p of opts) {
      const full = applyTemplate(t, 90, [p])
      const short = applyTemplate(t, 60, [p])
      const count = (days: TemplateDay[]) => days.flatMap(d => d.exercises).filter(e => e.muscle === p).length
      assert.equal(count(short), count(full), `${t.daysPerWeek}日 ${p}: 60分で重点部位の種目が減った`)
    }
  }
})

test('週4日で胸を選ぶと、Upper A の三頭がペックフライになる（改定ルール③ Slot Swap）', () => {
  const days = applyTemplate(BASE_TEMPLATES[4], 60, ['chest'])
  const upperA = days.find(d => d.day === 1)!
  assert.ok(upperA.exercises.some(e => e.code === 'pec_deck_fly'))
  assert.ok(!upperA.exercises.some(e => e.muscle === 'triceps'))
})

test('二つ選んだ時、もう一方の重点部位の種目は奪わない（胸＋三頭なら三頭は残る）', () => {
  const days = applyTemplate(BASE_TEMPLATES[4], 90, ['chest', 'triceps'])
  assert.ok(days.flatMap(d => d.exercises).some(e => e.muscle === 'triceps'))
})

test('差し替えルールは全部位に定義されている', () => {
  for (const p of opts) assert.ok(PRIORITY_SWAPS[p], p)
})

test('週2〜7日すべてにテンプレートがあり、Day の数が週の日数と同じ', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    assert.equal(BASE_TEMPLATES[n]?.days.length, n, `${n}日`)
    assert.deepEqual(BASE_TEMPLATES[n].days.map(d => d.day), Array.from({ length: n }, (_, i) => i + 1))
  }
})

test('脚を選ぶと、ふくらはぎの枠が脚のアイソレーションに差し替わる（ふくらはぎ自体は脚の種目でも奪える）', () => {
  for (const n of [2, 4, 5, 6]) {
    const days = applyTemplate(BASE_TEMPLATES[n], 90, ['legs'])
    const codes = days.flatMap(d => d.exercises.map(e => e.code))
    assert.ok(codes.includes('leg_extension') || codes.includes('leg_curl'), `${n}日: 脚のアイソレーションが入っていない`)
  }
  // 脚＋体幹: 先に選んだ脚がふくらはぎを使い、体幹は奪わない
  const both = applyTemplate(BASE_TEMPLATES[4], 90, ['legs', 'core'])
  assert.ok(both.flatMap(d => d.exercises).some(e => e.code === 'leg_curl' || e.code === 'leg_extension'))
})

test('プログラムの種類: 初心者は性別に関係なく初心者向け（週2・3日）、女性向けは週2〜4日、通常は週2〜7日', () => {
  assert.equal(resolveProgramType('male', 'beginner'), 'beginner')
  assert.equal(resolveProgramType('female', 'beginner'), 'beginner')
  assert.equal(resolveProgramType('female', 'intermediate'), 'women')
  assert.equal(resolveProgramType('male', 'intermediate'), 'standard')
  assert.deepEqual(availableDays('beginner'), [2, 3])
  assert.deepEqual(availableDays('women'), [2, 3, 4])
  assert.deepEqual(availableDays('standard'), [2, 3, 4, 5, 6, 7])
  for (const [type, set] of Object.entries(TEMPLATE_SETS)) {
    for (const [n, t] of Object.entries(set)) {
      assert.equal(t.days.length, Number(n), `${type} ${n}日`)
      assert.deepEqual(t.days.map(d => d.day), Array.from({ length: Number(n) }, (_, i) => i + 1), `${type} ${n}日`)
    }
  }
})
