'use client'

import { useState } from 'react'
import TrainerNav from './TrainerNav'

export const NAV_COLLAPSED_COOKIE = 'auxlog_trainer_nav_collapsed'

// トレーナー画面の枠。PCの左サイドバーは閉じられる（2026-10-19 オーナー依頼）。開閉はCookieに
// 残し、サーバー側で初期値を渡すので、読み込み直しても一瞬開いた状態が映らない。
export default function TrainerShell({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${NAV_COLLAPSED_COOKIE}=${next ? '1' : '0'}; path=/trainer; max-age=31536000; samesite=lax`
  }

  return (
    // light-only: トレーナー画面は端末の設定に関係なくライトモード（globals.css）。
    // 高さは dvh: iPhone の Safari では 100vh が見えている高さより大きく、中身が短くても画面が動いてしまう
    <div className="light-only min-h-dvh bg-zinc-50">
      <TrainerNav collapsed={collapsed} onToggle={toggle} />
      <main className={`pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 transition-[padding] ${collapsed ? 'md:pl-16' : 'md:pl-56'}`}>
        {children}
      </main>
    </div>
  )
}
