import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardTodos, highlights, weekSummary } from './dashboard'
import type { TraineeRow } from './trainees'

const row = (p: Partial<TraineeRow>): TraineeRow => ({
  linkId: 'l', traineeId: 't', name: 'A', status: 'active', isSelf: false, startedAt: '2026-09-01', endedAt: null,
  plan: { id: 'p', name: 'P', currentWeek: 2, totalWeeks: 9, status: 'active', startDate: '2026-09-01' },
  progress: { done: 2, total: 4, skipped: 0 }, lastTrainedOn: '2026-10-20', alerts: [], invite: null, ...p,
})

test('dashboardTodos: アラート・期限切れの招待・次のプラン待ちを、連絡が要る順に並べる（自分は除く）', () => {
  const items = dashboardTodos([
    row({ linkId: '1', name: '招待', status: 'invited', plan: null, progress: null, invite: { code: 'X', expiresAt: '2026-10-01', expired: true } }),
    row({ linkId: '2', name: '待ち', plan: { id: 'p2', name: 'P', currentWeek: 9, totalWeeks: 9, status: 'ended', startDate: null } }),
    row({ linkId: '3', name: '停滞', alerts: [{ kind: 'stalled', message: 's' }] }),
    row({ linkId: '4', name: '記録なし', alerts: [{ kind: 'no_record', message: 'n' }] }),
    row({ linkId: '5', name: '自分', isSelf: true, alerts: [{ kind: 'no_record', message: 'n' }] }),
    row({ linkId: '6', name: '順調' }),
  ])
  assert.deepEqual(items.map(i => i.kind), ['no_record', 'stalled', 'waiting_plan', 'invite_expired'])
  assert.match(items[2].message, /次のプラン/)
})

test('weekSummary: 契約中で進行中のプランの人だけ合計し、進みの遅い人を上にする', () => {
  const s = weekSummary([
    row({ linkId: '1', name: 'B', progress: { done: 4, total: 4, skipped: 1 } }),
    row({ linkId: '2', name: 'C', progress: { done: 1, total: 4, skipped: 0 } }),
    row({ linkId: '3', name: '終了', status: 'ended' }),
    row({ linkId: '4', name: '自分', isSelf: true }),
  ])
  assert.deepEqual({ done: s.done, total: s.total, skipped: s.skipped, pct: s.pct }, { done: 5, total: 8, skipped: 1, pct: 63 })
  assert.deepEqual(s.people.map(p => p.name), ['C', 'B'])
  assert.equal(weekSummary([]).pct, null)
})

test('highlights: 直近4週間で、それ以前のベストを1kg以上上回った種目だけ（伸びの大きい順）', () => {
  const today = new Date('2026-10-25T03:00:00Z')
  const result = highlights(new Map([
    ['u1', [
      { exerciseKey: 'bench', trainedOn: '2026-09-01', weightKg: 80, reps: 5 },   // 93.5
      { exerciseKey: 'bench', trainedOn: '2026-10-20', weightKg: 85, reps: 5 },   // 99 → +5.5
      { exerciseKey: 'squat', trainedOn: '2026-09-01', weightKg: 100, reps: 5 },  // 116.5
      { exerciseKey: 'squat', trainedOn: '2026-10-20', weightKg: 100, reps: 5 },  // 同じ → 出さない
      { exerciseKey: 'dead', trainedOn: '2026-10-20', weightKg: 140, reps: 3 },   // 以前の記録なし → 出さない
    ]],
    ['u2', [
      { exerciseKey: 'bench', trainedOn: '2026-09-10', weightKg: 60, reps: 8 },   // 76
      { exerciseKey: 'bench', trainedOn: '2026-10-24', weightKg: 70, reps: 8 },   // 88.5 → +12.5
    ]],
  ]), today)
  assert.deepEqual(result.map(h => [h.userId, h.exerciseKey, h.gainKg, h.trainedOn]), [['u2', 'bench', 12.5, '2026-10-24'], ['u1', 'bench', 5.5, '2026-10-20']])
})
