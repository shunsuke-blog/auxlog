/**
 * ローカル日付を YYYY-MM-DD 形式で返す（クライアント用）
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

/**
 * JST（UTC+9）の今日を UTC midnight の Date として返す（サーバー用）
 * trained_at は DATE 型（UTC midnight 解釈）なので、
 * diffDays の両辺を UTC midnight に揃えることで日数計算が正確になる。
 *
 * TODO: 多言語対応時はユーザーのタイムゾーンを users テーブルに保持し、
 * オフセットを動的に切り替えること（例: 'America/New_York' なら UTC-5/-4）。
 */
export function todayInJST(): Date {
  const jstMs = Date.now() + 9 * 60 * 60 * 1000
  const jst = new Date(jstMs)
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()))
}

/**
 * 任意の日時をJST（UTC+9）の日付文字列（YYYY-MM-DD）に変換する。
 * trained_at（DATE型）と同じ粒度でtimestamptzカラムを比較したい場合に使う
 * （week-status route: current_week_started_atとweekStartの比較など）。
 */
export function jstDateStr(date: Date): string {
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000
  const jst = new Date(jstMs)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
