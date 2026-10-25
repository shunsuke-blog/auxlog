'use client'

import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

// テンプレート名をその場で変える欄（ペンを押すと入力欄にカーソルが入る。欄の外に出ると保存）
export default function TemplateNameInput({ planId, initialName }: { planId: string; initialName: string }) {
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  const nameRef = useRef<HTMLInputElement>(null)

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedName) { setName(savedName); return }
    const res = await fetch(`/api/trainer/templates/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null)
    if (res?.ok) setSavedName(trimmed)
    else setName(savedName)
  }

  return (
    <div className="flex-1 min-w-0 flex items-center gap-1.5">
      {/* 入力欄の幅を名前の表示幅に合わせる（見えない同じ文字列を重ねて幅を決める）。
          size（文字数）だと全角文字の幅が足りず、名前が途中で切れていた（2026-10-25 修正） */}
      <span className="inline-grid min-w-0 max-w-full text-lg font-semibold">
        <span aria-hidden className="invisible whitespace-pre px-1 [grid-area:1/1] truncate">{name || 'テンプレート名'} </span>
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => {
            // 日本語入力の変換を確定する Enter では保存しない（確定前に欄を離れると、入力中の文字が2重になる）。
            // Safari は変換確定の Enter で isComposing が false のことがあるため keyCode 229 も見る
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur()
          }}
          maxLength={60}
          placeholder="テンプレート名"
          // 入力欄の既定の幅（約20文字分）が幅を決めないよう最小にし、重ねた名前の幅に合わせる
          size={1}
          className="[grid-area:1/1] w-full min-w-0 bg-transparent text-black dark:text-white rounded-md px-1 -ml-1 focus:outline-none focus:bg-zinc-50 focus:ring-1 focus:ring-zinc-300"
        />
      </span>
      <button type="button" onClick={() => nameRef.current?.focus()} title="名前を変更" aria-label="名前を変更" className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-black hover:bg-zinc-100">
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}
