'use client'

import { createContext, useContext, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// クライアント詳細のタブ（2026-11-09 オーナー決定: 上に名前・アラート・今週の進み具合を常に出し、下はタブで切り替える）。
// どのタブの中身も画面に残したまま見せ方だけを変える（今週のメニューの入力や直している記録を、タブを移っても失わない）。
// 開いているタブは URL の ?tab= に残す（再読み込み・戻るで同じタブに戻る）
export type DetailTabKey = 'week' | 'records' | 'plan' | 'bests'
export type DetailTab = { key: DetailTabKey; label: string }

const TabContext = createContext<{ tab: DetailTabKey | null; setTab: (t: DetailTabKey) => void }>({ tab: null, setTab: () => {} })

export function useDetailTab() {
  return useContext(TabContext)
}

export function DetailTabs({ tabs, children }: { tabs: DetailTab[]; children: React.ReactNode }) {
  const params = useSearchParams()
  const fromUrl = params.get('tab')
  const [tab, setTabState] = useState<DetailTabKey>(() => tabs.find(t => t.key === fromUrl)?.key ?? tabs[0].key)

  const setTab = (t: DetailTabKey) => {
    setTabState(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    window.history.replaceState(window.history.state, '', url)
  }

  return (
    <TabContext.Provider value={{ tab, setTab }}>
      <div className="space-y-4">
        {tabs.length > 1 && (
          <div role="tablist" className="flex gap-1 border-b border-zinc-100 dark:border-zinc-900 overflow-x-auto scrollbar-none">
            {tabs.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={t.key === tab}
                onClick={() => setTab(t.key)}
                className={`shrink-0 px-3 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                  t.key === tab
                    ? 'border-brand text-black dark:text-white'
                    : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {children}
      </div>
    </TabContext.Provider>
  )
}

export function TabPanel({ name, children }: { name: DetailTabKey; children: React.ReactNode }) {
  const { tab } = useDetailTab()
  return <div role="tabpanel" hidden={tab !== name}>{children}</div>
}
