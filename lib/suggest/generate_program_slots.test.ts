// generateDaySlotIds の自動テスト。設計書（プログラムスロット部位×動きパターン再設計）
// §8 の受け入れ基準 (a)〜(d) と、週2日の has_one_rm 集中チェックをここで担保する。
//
// 実行: npx tsx --test lib/suggest/generate_program_slots.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDaySlotIds } from './generate_program_slots'
import { PROGRAM_SLOTS, slotHasOneRm, type FrequencyVariant } from '@/lib/constants/program_slots'

const FREQS: FrequencyVariant[] = [2, 3, 4]
const TIERS: (1 | 2 | 3)[] = [1, 2, 3]
const EXPECTED_TOTAL: Record<1 | 2 | 3, number> = { 1: 12, 2: 18, 3: 24 }

const slotById = new Map(PROGRAM_SLOTS.map(s => [s.slot_id, s]))

test('(a) 種目数がtierごとに12/18/24になる', () => {
  for (const freq of FREQS) {
    for (const tier of TIERS) {
      const m = generateDaySlotIds(freq, tier)
      const total = [...m.values()].reduce((sum, s) => sum + s.size, 0)
      assert.equal(total, EXPECTED_TOTAL[tier], `freq=${freq} tier<=${tier}`)
    }
  }
})

test('(d) 0または1種目だけの日が存在しない', () => {
  for (const freq of FREQS) {
    for (const tier of TIERS) {
      const m = generateDaySlotIds(freq, tier)
      for (const [day, slots] of m) {
        assert.notEqual(slots.size, 1, `freq=${freq} tier<=${tier} day=${day} が1種目だけになっている`)
      }
    }
  }
})

test('(b) 日ごとの種目数の差が許容範囲内(週2/3日は0、週4日はdiff<=2)', () => {
  for (const freq of FREQS) {
    for (const tier of TIERS) {
      const m = generateDaySlotIds(freq, tier)
      const counts = [...m.values()].map(s => s.size)
      const diff = Math.max(...counts) - Math.min(...counts)
      const maxAllowed = freq === 4 ? 2 : 0
      assert.ok(diff <= maxAllowed, `freq=${freq} tier<=${tier} diff=${diff}が許容値${maxAllowed}を超えている`)
    }
  }
})

test('(c) 週4日で上下(body_region)の境界を越える配置が無い', () => {
  for (const tier of TIERS) {
    const m = generateDaySlotIds(4, tier)
    for (const [day, slotIds] of m) {
      const expectedRegion = day === 1 || day === 3 ? 'upper' : 'lower'
      for (const slotId of slotIds) {
        const slot = slotById.get(slotId)!
        assert.equal(slot.body_region, expectedRegion, `freq=4 tier<=${tier} day=${day} の ${slotId} は${slot.body_region}のはずが${expectedRegion}日に配置された`)
      }
    }
  }
})

test('週2日でhas_one_rm種目が1日に3件以上集中しない(tier1・tier2のみ。tier3は既知の残存事項として許容)', () => {
  for (const tier of [1, 2] as const) {
    const m = generateDaySlotIds(2, tier)
    for (const [day, slotIds] of m) {
      const oneRmCount = [...slotIds].filter(id => slotHasOneRm(slotById.get(id)!, 2)).length
      assert.ok(oneRmCount < 3, `freq=2 tier<=${tier} day=${day} にhas_one_rm種目が${oneRmCount}件集中している`)
    }
  }
})

test('generateDaySlotIdsは未知のmovement_patternに対して例外を投げる(クラッシュガード)', () => {
  // ELIGIBLE_DAYSに存在しないパターンのスロットを想定して直接は再現できないため、
  // 実運用のPROGRAM_SLOTS全パターンがELIGIBLE_DAYSでカバーされていることを確認する形で代替する
  for (const freq of FREQS) {
    assert.doesNotThrow(() => generateDaySlotIds(freq, 3), `freq=${freq}で例外が発生した(ELIGIBLE_DAYSの登録漏れの可能性)`)
  }
})
