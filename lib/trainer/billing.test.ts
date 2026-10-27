import { test } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { nextPlanOf, trainerSubscriptionUpdate, upgradeHint } from './billing'

const sub = (over: Partial<Stripe.Subscription>) => ({
  id: 'sub_1', status: 'active', cancel_at_period_end: false, cancel_at: null,
  items: { data: [{ current_period_end: 1798000000, price: { metadata: { auxlog_plan: 'trainer_pro' } } }] }, metadata: {}, ...over,
}) as unknown as Stripe.Subscription

test('trainerSubscriptionUpdate: 支払い中（再試行中を含む）はプロ、終了・未払いはスターター', () => {
  assert.equal(trainerSubscriptionUpdate(sub({ status: 'active' })).plan, 'pro')
  assert.equal(trainerSubscriptionUpdate(sub({ status: 'past_due' })).plan, 'pro')
  assert.equal(trainerSubscriptionUpdate(sub({ status: 'canceled' })).plan, 'starter')
  assert.equal(trainerSubscriptionUpdate(sub({ status: 'unpaid' })).plan, 'starter')
  assert.equal(trainerSubscriptionUpdate(sub({ status: 'incomplete_expired' })).plan, 'starter')
})

test('trainerSubscriptionUpdate: 更新日は品目から、解約予約は cancel_at でも立てる', () => {
  const u = trainerSubscriptionUpdate(sub({ cancel_at: 1798000000 }))
  assert.equal(u.current_period_end, new Date(1798000000 * 1000).toISOString())
  assert.equal(u.cancel_at_period_end, true)
  assert.equal(trainerSubscriptionUpdate(sub({})).cancel_at_period_end, false)
})

test('trainerSubscriptionUpdate: 価格の metadata でビジネスを見分ける', () => {
  const business = sub({ items: { data: [{ current_period_end: 1798000000, price: { metadata: { auxlog_plan: 'trainer_business' } } }] } as unknown as Stripe.Subscription['items'] })
  assert.equal(trainerSubscriptionUpdate(business).plan, 'business')
  assert.equal(trainerSubscriptionUpdate({ ...business, status: 'canceled' } as Stripe.Subscription).plan, 'starter')
})

test('trainerSubscriptionUpdate: 価格の metadata でベーシックを見分ける（2026-10-27 新設）', () => {
  const basic = sub({ items: { data: [{ current_period_end: 1798000000, price: { metadata: { auxlog_plan: 'trainer_basic' } } }] } as unknown as Stripe.Subscription['items'] })
  assert.equal(trainerSubscriptionUpdate(basic).plan, 'basic')
})

test('上限に達した時の案内: 一つ上のプラン。ビジネスの上は無い', () => {
  assert.equal(nextPlanOf('starter'), 'basic')
  assert.equal(nextPlanOf('basic'), 'pro')
  assert.equal(nextPlanOf('pro'), 'business')
  assert.equal(nextPlanOf('business'), null)
  assert.equal(upgradeHint('starter'), 'ベーシックプラン（月¥2,980・クライアント10名まで）')
  assert.equal(upgradeHint('business'), null)
})
