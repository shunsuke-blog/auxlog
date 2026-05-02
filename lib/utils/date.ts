/**
 * ローカル日付を YYYY-MM-DD 形式で返す
 * new Date().toISOString() は UTC なので日本時間 23時以降にズレが生じる。
 * このユーティリティはローカルタイムゾーンの日付を使用する。
 */
export function todayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
