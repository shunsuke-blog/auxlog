import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTraineeActivity, traineeAlerts, weekProgress } from './traineeStatus'

const today = new Date('2026-10-20T03:00:00Z')

test('weekProgress: スキップは分母から除き、別に数える（記録済みなら記録を優先）', () => {
  const p = weekProgress(['a', 'b', 'c', 'd', 'e', 'f', 'g'], new Set(['a', 'b', 'c', 'd']), new Set(['g', 'a']))
  assert.deepEqual(p, { done: 4, total: 6, skipped: 1 })
})

test('traineeAlerts: 7日以上記録が無いとアラート、6日なら出ない', () => {
  const base = { status: 'active', startedAt: '2026-09-01', oneRmSets: [], today }
  assert.equal(traineeAlerts({ ...base, lastTrainedOn: '2026-10-13' })[0]?.kind, 'no_record')
  assert.equal(traineeAlerts({ ...base, lastTrainedOn: '2026-10-14' }).length, 0)
})

test('traineeAlerts: 記録が一度も無い場合は契約開始からの日数で判定', () => {
  assert.equal(traineeAlerts({ status: 'active', startedAt: '2026-10-18', lastTrainedOn: null, oneRmSets: [], today }).length, 0)
  assert.match(traineeAlerts({ status: 'active', startedAt: '2026-10-10', lastTrainedOn: null, oneRmSets: [], today })[0].message, /契約開始から10日間/)
})

test('traineeAlerts: 直近3週間で推定1RMを更新した種目があれば停滞アラートは出ない', () => {
  const sets = [
    { exerciseKey: 'bench', trainedOn: '2026-09-10', weightKg: 80, reps: 5 },
    { exerciseKey: 'bench', trainedOn: '2026-10-15', weightKg: 82.5, reps: 5 },
    { exerciseKey: 'squat', trainedOn: '2026-09-10', weightKg: 100, reps: 5 },
    { exerciseKey: 'squat', trainedOn: '2026-10-15', weightKg: 95, reps: 5 },
  ]
  const alerts = traineeAlerts({ status: 'active', startedAt: '2026-09-01', lastTrainedOn: '2026-10-15', oneRmSets: sets, today })
  assert.equal(alerts.length, 0)
})

test('traineeAlerts: どの種目も更新していなければ停滞アラート', () => {
  const sets = [
    { exerciseKey: 'bench', trainedOn: '2026-09-10', weightKg: 80, reps: 5 },
    { exerciseKey: 'bench', trainedOn: '2026-10-15', weightKg: 80, reps: 5 },
  ]
  const alerts = traineeAlerts({ status: 'active', startedAt: '2026-09-01', lastTrainedOn: '2026-10-15', oneRmSets: sets, today })
  assert.deepEqual(alerts.map(a => a.kind), ['stalled'])
})

test('traineeAlerts: 契約から3週間未満、比較できる記録が無い、契約中でない場合は停滞を判定しない', () => {
  const sets = [{ exerciseKey: 'bench', trainedOn: '2026-10-15', weightKg: 80, reps: 5 }]
  assert.equal(traineeAlerts({ status: 'active', startedAt: '2026-10-05', lastTrainedOn: '2026-10-15', oneRmSets: sets, today }).length, 0)
  assert.equal(traineeAlerts({ status: 'active', startedAt: '2026-09-01', lastTrainedOn: '2026-10-15', oneRmSets: sets, today }).length, 0)
  assert.equal(traineeAlerts({ status: 'ended', startedAt: '2026-09-01', lastTrainedOn: '2026-09-02', oneRmSets: [], today }).length, 0)
})

test('parseTraineeActivity: DBの集計をトレーニーごとに分け、numeric の文字列も数値にする', () => {
  const { lastByUser, oneRmByUser } = parseTraineeActivity({
    last: { u1: '2026-10-15' },
    samples: [
      { user_id: 'u1', exercise: 'bench', trained_on: '2026-10-15', weight_kg: '82.5', reps: 5 },
      { user_id: 'u2', exercise: 'squat', trained_on: '2026-10-14', weight_kg: 100, reps: 3 },
    ],
  })
  assert.equal(lastByUser.get('u1'), '2026-10-15')
  assert.equal(lastByUser.get('u2'), undefined)
  assert.deepEqual(oneRmByUser.get('u1'), [{ exerciseKey: 'bench', trainedOn: '2026-10-15', weightKg: 82.5, reps: 5 }])
  assert.equal(parseTraineeActivity(null).oneRmByUser.size, 0)
})

test('traineeAlerts: プランの開始日が契約より後なら、そこから数える。開始前はアラートを出さない', () => {
  const base = { status: 'active', startedAt: '2026-10-01T03:00:00Z', lastTrainedOn: null, oneRmSets: [], today }
  assert.match(traineeAlerts(base)[0].message, /契約開始から19日間/)
  assert.match(traineeAlerts({ ...base, planStartDate: '2026-10-10' })[0].message, /プラン開始から10日間/)
  assert.equal(traineeAlerts({ ...base, planStartDate: '2026-10-15' }).length, 0)
  assert.equal(traineeAlerts({ ...base, planStartDate: '2026-10-21' }).length, 0)
  // プランの開始日が契約より前（過去の日付を選んだ）なら契約の開始日から数える
  assert.match(traineeAlerts({ ...base, planStartDate: '2026-09-01' })[0].message, /契約開始から19日間/)
})
