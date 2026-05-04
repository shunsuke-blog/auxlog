'use client'

import { usePathname } from 'next/navigation'
import { Home, PenLine, BarChart2, Settings } from 'lucide-react'
import { useNavigationGuard } from '@/lib/contexts/NavigationGuard'

const tabs = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/record', label: '記録', icon: PenLine },
  { href: '/history', label: '履歴', icon: BarChart2 },
  { href: '/settings', label: '設定', icon: Settings },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { guardedPush } = useNavigationGuard()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center max-w-lg mx-auto">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <button
              key={href}
              onClick={() => guardedPush(href)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5"
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive
                    ? 'text-black dark:text-white'
                    : 'text-zinc-400 dark:text-zinc-600'
                }`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'text-black dark:text-white'
                    : 'text-zinc-400 dark:text-zinc-600'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
