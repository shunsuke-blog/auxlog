import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMonthDay, todayInJapan, weekDateRange } from './week_dates'

test('weekDateRange: 開始日から7日ごと、月をまたいでも正しい', () => {
  assert.equal(weekDateRange('2026-10-26', 1), '10/26(月) 〜 11/1(日)')
  assert.equal(weekDateRange('2026-10-26', 2), '11/2(月) 〜 11/8(日)')
  assert.equal(formatMonthDay('2026-10-25T03:55:43Z'), '10/25(日)')
})

test('todayInJapan: UTC 15時以降は日本の翌日', () => {
  assert.equal(todayInJapan(new Date('2026-10-25T14:59:00Z')), '2026-10-25')
  assert.equal(todayInJapan(new Date('2026-10-25T15:00:00Z')), '2026-10-26')
})
