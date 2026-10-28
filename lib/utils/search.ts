// 種目名の検索で、表記の違いを吸収する（2026-10-28 オーナー指摘: ひらがなで検索しても当たらなかった）。
// 全角・半角（NFKC）、英字の大文字・小文字、ひらがな・カタカナ、空白・中黒の有無をそろえて比べる。
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・]/g, '')
}

// name が検索語 query を含むか。query が空なら常に true
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeForSearch(query)
  return q === '' || normalizeForSearch(name).includes(q)
}
