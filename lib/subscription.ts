// trialing はカード未登録でも全機能使用可能。期限切れ or canceled は false。
export function canUseApp(status: string, trialEndsAt: string): boolean {
  if (status === 'active') return true
  if (status === 'trialing') {
    return new Date(trialEndsAt) > new Date()
  }
  return false
}
