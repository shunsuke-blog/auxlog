'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'

// 見出しの横に置く「？」。押すと説明の吹き出しを出す（外側を押す・Esc で閉じる）。
// 横スクロールの枠の中でも切れないように、吹き出しは画面基準（fixed）で「？」の下に出す。
export default function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || popRef.current?.contains(t)) return
      setPos(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const onScroll = () => setPos(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [pos])

  const toggle = () => {
    if (pos) { setPos(null); return }
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 256
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8)
    setPos({ top: r.bottom + 6, left })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        onClick={toggle}
        aria-label={`${label}の説明`}
        aria-expanded={pos != null}
        className="inline-flex align-middle ml-0.5 p-0.5 rounded-full text-zinc-400 hover:text-black dark:hover:text-white"
      >
        <CircleHelp className="w-3.5 h-3.5" />
      </button>
      {pos && (
        <div
          ref={popRef}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-64 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg text-xs font-normal leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-normal text-left"
        >
          <p className="mb-1 text-sm font-semibold text-black dark:text-white">{label}</p>
          {children}
        </div>
      )}
    </>
  )
}
