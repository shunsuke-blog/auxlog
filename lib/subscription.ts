// trialing/canceling は期限内なら使用可能。canceled/past_due は false。
export function canUseApp(status: string, trialEndsAt: string): boolean {
  if (status === 'active') return true
  if (status === 'trialing' || status === 'canceling') {
    return new Date(trialEndsAt) > new Date()
  }
  return false
}
