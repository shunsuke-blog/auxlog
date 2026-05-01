export function canUseApp(status: string, trialEndsAt: string): boolean {
  if (status === 'active') return true
  if (status === 'trialing') {
    return new Date(trialEndsAt) > new Date()
  }
  return false
}
