'use client'

import { createContext, useContext, useState } from 'react'
import SearchBox from '@/components/ui/SearchBox'
import { matchesSearch } from '@/lib/utils/search'
import type { TraineeRow } from '@/lib/trainer/trainees'
import TraineeListItem from './TraineeListItem'

// クライアントの名前での検索（2026-10-29 オーナー依頼: 30名になると探しにくい）。
// 検索欄は上の固定の帯に置き（2026-10-30 オーナー指示）、一覧とは入力を共有する
const QueryContext = createContext<{ query: string; setQuery: (q: string) => void }>({ query: '', setQuery: () => {} })

export function TraineeSearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState('')
  return <QueryContext.Provider value={{ query, setQuery }}>{children}</QueryContext.Provider>
}

export function TraineeSearchBox() {
  const { query, setQuery } = useContext(QueryContext)
  return <SearchBox value={query} onChange={setQuery} placeholder="クライアントの名前で検索" />
}

// hrefBase を渡すと、各行のリンクを hrefBase + linkId にする（チームのメンバーのクライアント一覧など）
export default function TraineeSearchList({ rows, selectedLinkId, hrefBase, empty }: {
  rows: TraineeRow[]
  selectedLinkId: string | null
  hrefBase?: string
  empty: string
}) {
  const { query } = useContext(QueryContext)
  const filtered = rows.filter(r => matchesSearch(r.name, query))

  if (rows.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-10">{empty}</p>
  if (filtered.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-10">「{query.trim()}」に当てはまるクライアントはいません。</p>
  return filtered.map(r => <TraineeListItem key={r.linkId} row={r} selected={r.linkId === selectedLinkId} href={hrefBase ? `${hrefBase}${r.linkId}` : undefined} />)
}
