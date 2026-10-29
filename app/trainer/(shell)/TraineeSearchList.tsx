'use client'

import { useState } from 'react'
import SearchBox from '@/components/ui/SearchBox'
import { matchesSearch } from '@/lib/utils/search'
import type { TraineeRow } from '@/lib/trainer/trainees'
import TraineeListItem from './TraineeListItem'

// クライアントの一覧と、名前での検索（2026-10-29 オーナー依頼: 30名になると探しにくい）。
// hrefBase を渡すと、各行のリンクを hrefBase + linkId にする（チームのメンバーのクライアント一覧など）
export default function TraineeSearchList({ rows, selectedLinkId, hrefBase, empty }: {
  rows: TraineeRow[]
  selectedLinkId: string | null
  hrefBase?: string
  empty: string
}) {
  const [query, setQuery] = useState('')
  const filtered = rows.filter(r => matchesSearch(r.name, query))

  if (rows.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-10">{empty}</p>
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="クライアントの名前で検索" />
      {filtered.length === 0
        ? <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-10">「{query.trim()}」に当てはまるクライアントはいません。</p>
        : filtered.map(r => <TraineeListItem key={r.linkId} row={r} selected={r.linkId === selectedLinkId} href={hrefBase ? `${hrefBase}${r.linkId}` : undefined} />)}
    </>
  )
}
