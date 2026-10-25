// プランの週の日付（開始日＋(週−1)×7日 〜 ＋6日）。トレーニーのホームとトレーナー画面で同じものを使う。
// 日付だけを扱うので UTC で計算する（サーバー・端末のタイムゾーンで1日ずれないように）

const DOW = ['日', '月', '火', '水', '木', '金', '土']

const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** 10/26(月) の形 */
export function formatMonthDay(iso: string): string {
  const d = parse(iso)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`
}

/** Week N の日付の範囲（10/26(月) 〜 11/1(日)） */
export function weekDateRange(startDate: string, week: number): string {
  const start = parse(startDate)
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return `${formatMonthDay(iso(start))} 〜 ${formatMonthDay(iso(end))}`
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayInJapan(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
