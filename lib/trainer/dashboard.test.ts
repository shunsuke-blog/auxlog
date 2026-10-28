import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardTodos, formatActivityTime, highlights, notStartedThisWeek, pendingInvites, repeatedSkips, shortfalls, sortActivity, usedTraineeSlots, weekSummary } from './dashboard'
import type { TraineeRow } from './trainees'

const row = (p: Partial<TraineeRow>): TraineeRow => ({
  linkId: 'l', traineeId: 't', name: 'A', status: 'active', isSelf: false, startedAt: '2026-09-01', endedAt: null,
  plan: { id: 'p', name: 'P', currentWeek: 2, totalWeeks: 9, status: 'active', startDate: '2026-09-01' },
  progress: { done: 2, total: 4, skipped: 0 }, lastTrainedOn: '2026-10-20', alerts: [], invite: null, ...p,
})

test('dashboardTodos: アラート・期限切れの招待・次のプラン待ちを、連絡が要る順に並べる（自分は除く）', () => {
  const items = dashboardTodos([
    row({ linkId: '1', name: '招待', status: 'invited', plan: null, progress: null, invite: { token: 'X', expiresAt: '2026-10-01', expired: true } }),
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

test('formatActivityTime: 日本時間で今日・昨日・月/日と時刻（日付だけの値は時刻なし）', () => {
  const now = new Date('2026-10-25T05:00:00Z') // 日本時間 10/25 14:00
  assert.deepEqual(formatActivityTime('2026-10-25T03:44:00Z', now), { day: '今日', time: '12:44' })
  assert.deepEqual(formatActivityTime('2026-10-24T16:00:00Z', now), { day: '今日', time: '01:00' })
  assert.deepEqual(formatActivityTime('2026-10-24T01:15:00Z', now), { day: '昨日', time: '10:15' })
  assert.deepEqual(formatActivityTime('2026-10-19', now), { day: '10/19', time: null })
})

test('sortActivity: 新しい順に件数を絞る', () => {
  const ev = (at: string) => ({ at, linkId: 'l', name: 'A', kind: 'recorded' as const, text: at })
  assert.deepEqual(sortActivity([ev('2026-10-19T00:00:00Z'), ev('2026-10-25T00:00:00Z'), ev('2026-10-22T00:00:00Z')], 2).map(e => e.at), ['2026-10-25T00:00:00Z', '2026-10-22T00:00:00Z'])
})

test('usedTraineeSlots: 招待中・契約中・一時停止中を数え、自分と契約終了は数えない', () => {
  assert.equal(usedTraineeSlots([
    row({ status: 'invited' }), row({ status: 'active' }), row({ status: 'paused' }), row({ status: 'ended' }), row({ isSelf: true }),
  ]), 3)
})

test('notStartedThisWeek: 週の4日目以降で今週の記録が0の人（7日記録なしのアラートの人は除く）', () => {
  const plan = { id: 'p', name: 'P', currentWeek: 2, totalWeeks: 9, status: 'active', startDate: '2026-10-12' } // Week2 = 10/19〜10/25
  const zero = { done: 0, total: 6, skipped: 0 }
  assert.deepEqual(notStartedThisWeek([row({ plan, progress: zero })], '2026-10-22').map(i => i.text), ['今週（Week 2）はまだ記録がありません（4日目）'])
  assert.equal(notStartedThisWeek([row({ plan, progress: zero })], '2026-10-21').length, 0)
  assert.equal(notStartedThisWeek([row({ plan, progress: { done: 1, total: 6, skipped: 0 } })], '2026-10-24').length, 0)
  assert.equal(notStartedThisWeek([row({ plan, progress: zero, alerts: [{ kind: 'no_record', message: 'n' }] })], '2026-10-24').length, 0)
  // 週を先に進めた（今週の開始日がまだ来ていない）人は出さない
  assert.equal(notStartedThisWeek([row({ plan: { ...plan, currentWeek: 3 }, progress: zero })], '2026-10-24').length, 0)
})

test('shortfalls: 目標より軽くした・回数が足りないセットを、種目ごとに最初の1つだけ', () => {
  const base = { linkId: 'l', name: 'A', trainedOn: '2026-10-24' }
  const items = shortfalls([
    { ...base, exercise: 'ベンチプレス', actual: [{ setNumber: 1, weightKg: 80, reps: 5, isWarmup: false }, { setNumber: 2, weightKg: 80, reps: 3, isWarmup: false }, { setNumber: 3, weightKg: 80, reps: 2, isWarmup: false }],
      targets: [{ setNumber: 1, weightKg: 80, reps: 5, isWarmup: false }, { setNumber: 2, weightKg: 80, reps: 5, isWarmup: false }, { setNumber: 3, weightKg: 80, reps: 5, isWarmup: false }] },
    { ...base, exercise: 'スクワット', actual: [{ setNumber: 1, weightKg: 40, reps: 10, isWarmup: true }, { setNumber: 2, weightKg: 90, reps: 5, isWarmup: false }],
      targets: [{ setNumber: 1, weightKg: 40, reps: 10, isWarmup: true }, { setNumber: 2, weightKg: 100, reps: 5, isWarmup: false }] },
    { ...base, exercise: 'レッグカール', actual: [{ setNumber: 1, weightKg: 30, reps: 12, isWarmup: false }], targets: [{ setNumber: 1, weightKg: null, reps: 10, isWarmup: false }] },
    { ...base, exercise: 'プランク（秒）', actual: [{ setNumber: 1, weightKg: 0, reps: 20, isWarmup: false }], targets: [{ setNumber: 1, weightKg: null, reps: 30, isWarmup: false }] },
  ])
  assert.deepEqual(items.map(i => i.text), [
    'ベンチプレス 目標 80kg×5回 → 3回（10/24）',
    'スクワット 目標 100kg×5回 → 90kg×5回（10/24）',
    'プランク（秒） 目標 30秒 → 20秒（10/24）',
  ])
})

test('repeatedSkips: 直近3週のうち2週以上でスキップした種目だけ', () => {
  const s = (exerciseKey: string, week: number) => ({ linkId: 'l', name: 'A', exerciseKey, exercise: exerciseKey, week, currentWeek: 5 })
  assert.deepEqual(repeatedSkips([s('ディップス', 4), s('ディップス', 5), s('カール', 2), s('カール', 5), s('ベンチ', 5)]).map(i => i.text), ['ディップスを直近3週で2回スキップ。種目の入れ替えを検討する'])
})

test('pendingInvites: 期限内で未入力の招待だけ', () => {
  const items = pendingInvites([
    row({ name: 'B', status: 'invited', invite: { token: 'ABCD2345', expiresAt: '2026-10-30T00:00:00Z', expired: false } }),
    row({ name: 'C', status: 'invited', invite: { token: 'X', expiresAt: '2026-10-01T00:00:00Z', expired: true } }),
  ])
  assert.deepEqual(items.map(i => i.text), ['招待リンクがまだ開かれていません（10/30まで）。本人に連絡する'])
})
