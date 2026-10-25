'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ClipboardList, LayoutDashboard, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

// トレーナー画面のタブ（2026-10-19 決定: 一覧／プログラム（テンプレート管理）／ダッシュボード／設定。2026-10-19 に管理画面から改名）。
// PC（md以上）は左のサイドバー、スマホは下部のタブで表示する。
const tabs = [
  { href: '/trainer', label: '契約者一覧', icon: Users },
  { href: '/trainer/programs', label: 'プログラム', icon: ClipboardList },
  { href: '/trainer/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/trainer/settings', label: '設定', icon: Settings },
]

export default function TrainerNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/trainer' ? pathname === '/trainer' : pathname.startsWith(href))

  return (
    <>
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950 transition-[width] ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* 開閉ボタンは開いていても閉じていても同じ位置（右上）に置く */}
        <div className={`flex items-start py-6 ${collapsed ? 'justify-center px-0' : 'justify-between pl-6 pr-3'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-lg font-semibold text-black dark:text-white">Auxlog</p>
              <p className="text-xs text-zinc-400">トレーナー</p>
            </div>
          )}
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
            className="group relative p-1.5 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-900"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {collapsed && <NavTooltip text="メニューを開く" />}
          </button>
        </div>
        <nav className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={collapsed ? label : undefined}
                className={`group relative flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                  active
                    ? 'bg-brand-soft text-brand-text'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.5 : 1.8} />
                {collapsed ? <NavTooltip text={label} /> : label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center max-w-lg mx-auto">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link key={href} href={href} className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5">
                <Icon
                  className={`w-5 h-5 ${active ? 'text-brand-text' : 'text-zinc-400 dark:text-zinc-600'}`}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span className={`text-[10px] font-medium ${active ? 'text-brand-text' : 'text-zinc-400 dark:text-zinc-600'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

// 閉じたサイドバーでアイコンに乗せた時のタブ名。ブラウザ標準の title は表示まで数秒かかるため、
// マウスを乗せたらすぐ出す（2026-10-22 オーナー指摘）。
function NavTooltip({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-200 text-xs font-medium text-white dark:text-zinc-900 whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-75 z-50">
      {text}
    </span>
  )
}
