'use client'

import { Search, X } from 'lucide-react'

// 一覧の上に置く検索欄（種目の検索欄と同じ見た目）。入力があれば右端の × で消せる
export default function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
      <Search className="w-4 h-4 text-zinc-400 shrink-0" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 text-sm bg-transparent text-black dark:text-white placeholder:text-zinc-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="検索を消す" className="text-zinc-400 hover:text-black dark:hover:text-white">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
