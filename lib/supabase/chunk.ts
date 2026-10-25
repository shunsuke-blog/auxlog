// ID の一覧で絞り込む取得を、URL の長さの上限に収まるよう分けて行う（2026-10-25 レビュー対応 H1）。
// PostgREST の in フィルタは ID を URL に並べるため、UUID 800件ほどで HTTP 400 になる（本番で確認、400件は通る）。

/** 1回の要求に並べる ID の上限。UUID 200件で URL は約7.5KB */
export const IN_CHUNK_SIZE = 200

/** ids を分けて fetch を呼び、結果をつなげる。fetch は ids の一部を受け取って行の配列を返す */
export async function selectInChunks<T>(ids: readonly string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const { data } = await fetch(ids.slice(i, i + IN_CHUNK_SIZE))
    if (data) out.push(...data)
  }
  return out
}
