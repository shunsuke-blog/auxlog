'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus } from 'lucide-react'
import { TemplateOneRmFields, useTemplateOneRms, type TemplateOption } from './TemplateOneRmFields'
import LoginLinkShare from './LoginLinkShare'

export type { TemplateOption }

type Issued = { token: string; expires_at: string; link_id: string }

// トレーニーの追加（2026-10-19 決定）: 共有するテンプレートを選ぶ → 招待リンクを出す（2026-10-28 招待コードから変更）。
// テンプレートの %1RM の種目は、ここで入力した1RMから kg を計算する（未入力なら重量は自動提案）。
// iconOnlyOnMobile: スマホでは人のマーク（＋）だけにする（ダッシュボードの見出しでボタンが大きくならないように、2026-10-25）
// limitReached: 無料枠の上限（クライアント3名）に達している。追加を押した時点で上限の案内を出し、名前や1RMを
// 入力した後で断らない（2026-10-25 オーナー指摘「入力した後でエラーになると萎える」）
export default function AddTraineeButton({ templates, label = '追加', iconOnlyOnMobile = false, limitReached = false, limit = 3, planLabel = 'スタータープラン', upgrade = null }: {
  templates: TemplateOption[]
  label?: string
  iconOnlyOnMobile?: boolean
  limitReached?: boolean
  limit?: number
  planLabel?: string
  /** 上限に達した時に案内する一つ上のプラン（lib/trainer/billing.ts の upgradeHint）。無ければ出さない */
  upgrade?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const picker = useTemplateOneRms()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)

  const template = templates.find(t => t.id === picker.templateId)

  const reset = () => {
    setName('')
    picker.reset()
    setError(null)
    setIssued(null)
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    if (issued) router.refresh()
    reset()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    const built = picker.buildPayload()
    if ('error' in built) {
      setError(built.error)
      return
    }
    const payload = built.payload
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/trainees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name, template_id: template.id, one_rms: payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'クライアントの追加に失敗しました')
      setIssued(data as Issued)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'クライアントの追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={label}
        title={iconOnlyOnMobile ? label : undefined}
        className={`shrink-0 h-10 flex items-center gap-1.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-sm font-medium ${iconOnlyOnMobile ? 'px-2.5 md:px-4' : 'px-4'}`}
      >
        {iconOnlyOnMobile ? (
          <>
            <UserPlus className="w-5 h-5 md:hidden" />
            <Plus className="hidden md:block w-4 h-4" />
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            {label}
          </>
        )}
      </button>

      {open && createPortal(
        // ボタンは一覧の見出し（backdrop-blur 付きの sticky）の中にあり、その中の fixed は見出しの範囲に
        // 閉じ込められてしまうため、画面全体に出すよう body 直下に描画する（2026-10-25 不具合修正）。
        // トレーナー画面の配色（light-only）は body 直下には効かないので、ここでも付ける。
        // 上揃え: 入力 → 招待リンクの表示で高さが変わっても上端（見出し）の位置を動かさない
        <div className="light-only fixed inset-0 z-50 flex items-start justify-center px-6 pt-[10vh] pb-6 overflow-y-auto">
          <div className="fixed inset-0 bg-black/60" onClick={close} />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl p-6 space-y-4">
            <p className="text-base font-semibold text-black dark:text-white">クライアントを追加</p>

            {limitReached && !issued ? (
              <div className="space-y-4">
                <p className="text-sm text-black dark:text-white leading-relaxed">
                  {planLabel}で招待できるクライアントは{limit}人までです。
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  今は招待中・契約中のクライアントが{limit}人います。新しく招待するには、使っていない招待を取り消すか、終わったクライアントとの契約を終了してください（終了した契約は数えません）。
                </p>
                {upgrade && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    もっと招待するには、<Link href="/trainer/settings" className="text-black dark:text-white underline hover:text-zinc-500">設定の「プラン」</Link>から{upgrade}にできます。
                  </p>
                )}
                <button onClick={close} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white cursor-pointer hover:bg-zinc-50">閉じる</button>
              </div>
            ) : issued ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{name} さんの招待リンクができました。文章をコピーして、LINE などで送ってください。</p>
                <LoginLinkShare token={issued.token} expiresAt={issued.expires_at} clientName={name} kind="invite" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">クライアントの詳細から、いつでも見返す・作り直すことができます。</p>
                <button onClick={close} className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">閉じる</button>
              </div>
            ) : templates.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">共有するプログラムがまだありません。先にプログラムのテンプレートを作成してください。</p>
                <Link href="/trainer/programs" className="block w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-center text-sm font-medium text-on-brand">プログラムを作る</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <input
                  required
                  maxLength={40}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="クライアントの名前"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
                />
                <TemplateOneRmFields templates={templates} state={picker} label="共有するプログラム" who="クライアント" />
                {(error ?? picker.loadError) && <p className="text-sm text-red-500">{error ?? picker.loadError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={close} disabled={busy} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900">キャンセル</button>
                  <button type="submit" disabled={busy || picker.loading || !name.trim() || !template} className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
                    {busy ? '作成中…' : '招待リンクを作る'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
