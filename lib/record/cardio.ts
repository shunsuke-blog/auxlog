// 有酸素運動の記録の表示（2026-10-26）。記録は training_sets の1行に、時間（秒）・距離（km）・消費カロリー（kcal）で持つ

export type CardioRecord = {
  duration_seconds?: number | null
  distance_km?: number | string | null
  calories_kcal?: number | null
}

/** 「45分」「1時間5分」 */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

/** 1kmあたりの時間「6:00/km」 */
export function formatPace(seconds: number, km: number): string {
  const perKm = Math.round(seconds / km)
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, '0')}/km`
}

/** 「30分 · 5.0km（6:00/km） · 300kcal」 */
export function formatCardio(r: CardioRecord): string {
  if (r.duration_seconds == null) return ''
  const parts = [formatDuration(r.duration_seconds)]
  const km = r.distance_km != null ? Number(r.distance_km) : null
  if (km != null && km > 0) parts.push(`${km.toFixed(1)}km（${formatPace(r.duration_seconds, km)}）`)
  if (r.calories_kcal != null) parts.push(`${r.calories_kcal}kcal`)
  return parts.join(' · ')
}

/** 入力欄の値から保存する値へ。時間は分で入力する。正しくなければ null */
export function parseCardioInput(input: { minutes: string; distanceKm: string; calories: string }):
  { duration_seconds: number; distance_km: number | null; calories_kcal: number | null } | null {
  const minutes = Number(input.minutes)
  if (!input.minutes.trim() || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return null
  const km = input.distanceKm.trim() ? Number(input.distanceKm) : null
  if (km != null && (!Number.isFinite(km) || km <= 0 || km > 1000)) return null
  const kcal = input.calories.trim() ? Number(input.calories) : null
  if (kcal != null && (!Number.isInteger(kcal) || kcal < 1 || kcal > 20000)) return null
  return {
    duration_seconds: Math.round(minutes * 60),
    distance_km: km != null ? Math.round(km * 100) / 100 : null,
    calories_kcal: kcal,
  }
}
