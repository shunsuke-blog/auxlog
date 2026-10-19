'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ClipboardList, LayoutDashboard, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

// トレーナー画面のタブ（2026-10-19 決定: 一覧／プログラム（テンプレート管理）／ダッシュボード／設定。2026-10-19 に管理画面から改名）。
// PC（md以上）は左のサイドバー、スマホは下部のタブで表示する。
const tabs = [
  { href: '/trainer', label: '一覧', icon: Users },
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
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black transition-[width] ${
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
            title={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
            aria-label={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-50 dark:hover:text-white dark:hover:bg-zinc-900"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
        <nav className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                  active
                    ? 'bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.5 : 1.8} />
                {!collapsed && label}
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
                  className={`w-5 h-5 ${active ? 'text-black dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span className={`text-[10px] font-medium ${active ? 'text-black dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}`}>
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
