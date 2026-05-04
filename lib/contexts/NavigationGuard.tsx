'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type NavigationGuardContextType = {
  isDirty: boolean
  setIsDirty: (v: boolean) => void
  guardedPush: (href: string) => void
}

const NavigationGuardContext = createContext<NavigationGuardContextType>({
  isDirty: false,
  setIsDirty: () => {},
  guardedPush: () => {},
})

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isDirty, setIsDirty] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  const guardedPush = useCallback((href: string) => {
    if (isDirty) {
      setPendingHref(href)
    } else {
      router.push(href)
    }
  }, [isDirty, router])

  const confirm = () => {
    if (!pendingHref) return
    setIsDirty(false)
    router.push(pendingHref)
    setPendingHref(null)
  }

  const cancel = () => setPendingHref(null)

  return (
    <NavigationGuardContext.Provider value={{ isDirty, setIsDirty, guardedPush }}>
      {children}

      {pendingHref && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={cancel} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">記録を破棄しますか？</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              保存していない記録は失われます。
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={cancel}
                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white"
              >
                記録を続ける
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-3 rounded-xl bg-red-500 text-sm font-medium text-white"
              >
                破棄する
              </button>
            </div>
          </div>
        </div>
      )}
    </NavigationGuardContext.Provider>
  )
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext)
}
