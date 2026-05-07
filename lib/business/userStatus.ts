export function isFreeActive(isFree: boolean, freeUntil: string | null): boolean {
  return isFree && (!freeUntil || new Date(freeUntil) > new Date())
}

export function calculateTrialDaysLeft(
  status: string | null,
  trialEndsAt: string | null,
  isAdmin: boolean,
  freeActive: boolean
): number | null {
  if (status !== 'trialing' || !trialEndsAt || isAdmin || freeActive) return null
  return Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}
