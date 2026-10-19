'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ClipboardList, LayoutDashboard, Settings } from 'lucide-react'

// トレーナー画面のタブ（2026-10-19 決定: 一覧／プログラム（テンプレート管理）／管理画面／設定）。
// PC（md以上）は左のサイドバー、スマホは下部のタブで表示する。
const tabs = [
  { href: '/trainer', label: '一覧', icon: Users },
  { href: '/trainer/programs', label: 'プログラム', icon: ClipboardList },
  { href: '/trainer/manage', label: '管理画面', icon: LayoutDashboard },
  { href: '/trainer/settings', label: '設定', icon: Settings },
]

export default function TrainerNav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/trainer' ? pathname === '/trainer' : pathname.startsWith(href))

  return (
    <>
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold text-black dark:text-white">Auxlog</p>
          <p className="text-xs text-zinc-400">トレーナー</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={active ? 2.5 : 1.8} />
                {label}
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
