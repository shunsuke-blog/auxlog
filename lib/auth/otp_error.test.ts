import { test } from 'node:test'
import assert from 'node:assert/strict'
import { otpSendErrorMessage } from './otp_error'

test('otpSendErrorMessage: 再送信の待ち時間・送信数の上限・それ以外を出し分ける', () => {
  assert.equal(
    otpSendErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' }),
    'コードは続けて送れません。42秒ほど待ってから、もう一度お試しください。',
  )
  assert.match(otpSendErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' }), /1時間ほど/)
  assert.match(otpSendErrorMessage({ status: 400, message: 'Unable to validate email address: invalid format' }), /メールアドレスを確認/)
})
