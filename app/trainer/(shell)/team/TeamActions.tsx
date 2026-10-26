'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'

// チーム画面の操作（2026-10-26）。すべて /api/trainer/team に action を送る（判定は DB の関数）
function useTeamAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'チームの操作に失敗しました')
      router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'チームの操作に失敗しました')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-sm text-black placeholder:text-zinc-400 focus:outline-none'
const primaryClass = 'h-11 px-5 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
const secondaryClass = 'h-9 px-3 rounded-lg border border-zinc-200 bg-white text-sm text-black cursor-pointer hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed'

// プランを申し込んだ後に、チームの名前・管理者の表示名・自分もクライアントを担当するかを決める（2026-10-26 オーナー指摘:
// 管理者用の登録ページは仮の名前で登録し、プランを確定させてからここで選んでもらう）
export function CreateTeamForm({ displayName }: { displayName: string }) {
  const { busy, error, run } = useTeamAction()
  const [name, setName] = useState('')
  const [myName, setMyName] = useState(displayName)
  const [ownerIsTrainer, setOwnerIsTrainer] = useState<boolean | null>(null)
  return (
    <form onSubmit={e => { e.preventDefault(); if (ownerIsTrainer != null) run({ action: 'create', name, display_name: myName, owner_is_trainer: ownerIsTrainer }) }} className="space-y-4">
      <label className="block text-xs text-zinc-500 space-y-1">
        <span>チームの名前</span>
        <input required maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="例: ◯◯ジム" className={inputClass} />
      </label>
      <label className="block text-xs text-zinc-500 space-y-1">
        <span>あなたの名前（チームのトレーナーとクライアントに表示されます）</span>
        <input required maxLength={40} value={myName} onChange={e => setMyName(e.target.value)} className={inputClass} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs text-zinc-500">あなたもクライアントを担当しますか？</legend>
        {[
          { value: true, label: '担当する', note: '管理しながら、自分のクライアントも持ちます。自分もトレーナー枠に数えます。' },
          { value: false, label: '担当しない（管理だけ）', note: 'チームの管理とプログラムの作成だけ行います。トレーナー枠は、ほかのトレーナーに使えます。' },
        ].map(o => (
          <label key={String(o.value)} className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer ${ownerIsTrainer === o.value ? 'border-brand bg-brand-soft' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}>
            <input type="radio" name="owner_is_trainer" checked={ownerIsTrainer === o.value} onChange={() => setOwnerIsTrainer(o.value)} className="mt-0.5 accent-[var(--brand)]" />
            <span className="text-sm text-black">
              {o.label}
              <span className="block text-xs text-zinc-500">{o.note}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-zinc-500">あとからチームの画面で変えられます。</p>
      </fieldset>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !name.trim() || !myName.trim() || ownerIsTrainer == null} className={primaryClass}>{busy ? '作成中…' : 'チームを作る'}</button>
      </div>
    </form>
  )
}

export function JoinTeamForm() {
  const { busy, error, run } = useTeamAction()
  const [code, setCode] = useState('')
  return (
    <form onSubmit={e => { e.preventDefault(); run({ action: 'join', code }) }} className="space-y-3">
      <input
        required
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="チームの招待コード"
        autoCapitalize="characters"
        className={`${inputClass} tracking-[0.2em] tabular-nums`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={busy || code.trim().length < 4} className={primaryClass}>{busy ? '送信中…' : '参加を申請する'}</button>
    </form>
  )
}

export function InviteCode({ code }: { code: string | null }) {
  const { busy, error, run } = useTeamAction()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const reissue = () => {
    if (window.confirm('招待コードを作り直しますか？\n今のコードは使えなくなります（参加済みのトレーナーはそのままです）。')) run({ action: 'reissue_invite' })
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <p className="text-2xl font-bold tracking-[0.2em] tabular-nums text-black">{code ?? '—'}</p>
        {code && (
          <button onClick={copy} aria-label="コピー" className="p-2 rounded-lg border border-zinc-200 text-zinc-500 cursor-pointer hover:bg-zinc-50">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
      </div>
      <button onClick={reissue} disabled={busy} className="text-sm text-zinc-500 underline hover:text-black disabled:opacity-50">招待コードを作り直す</button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function RenameTeam({ name }: { name: string }) {
  const { busy, error, run } = useTeamAction()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-base font-semibold text-black">{name}</p>
        <button onClick={() => setEditing(true)} className="text-sm text-zinc-500 underline hover:text-black">名前を変える</button>
      </div>
    )
  }
  return (
    <form onSubmit={async e => { e.preventDefault(); if (await run({ action: 'rename', name: value })) setEditing(false) }} className="flex items-center gap-2">
      <input required maxLength={40} value={value} onChange={e => setValue(e.target.value)} className={inputClass} />
      <button type="submit" disabled={busy || !value.trim()} className={secondaryClass}>保存</button>
      <button type="button" onClick={() => { setEditing(false); setValue(name) }} className={secondaryClass}>やめる</button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  )
}

export function OwnerIsTrainerToggle({ value }: { value: boolean }) {
  const { busy, error, run } = useTeamAction()
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          disabled={busy}
          onChange={e => run({ action: 'owner_is_trainer', value: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-[var(--brand)]"
        />
        <span className="text-sm text-black">
          自分もクライアントを担当する
          <span className="block text-xs text-zinc-500">担当する場合は自分もトレーナー枠に数えます。担当しない場合は、枠をすべてほかのトレーナーに使えます。</span>
        </span>
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function MemberRequestActions({ membershipId }: { membershipId: string }) {
  const { busy, error, run } = useTeamAction()
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button onClick={() => run({ action: 'decide', membership_id: membershipId, approve: true })} disabled={busy} className="h-9 px-3 rounded-lg bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand cursor-pointer disabled:opacity-50">承認</button>
        <button onClick={() => run({ action: 'decide', membership_id: membershipId, approve: false })} disabled={busy} className={secondaryClass}>却下</button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function RemoveMemberButton({ membershipId, name, clientCount }: { membershipId: string; name: string; clientCount: number }) {
  const { busy, error, run } = useTeamAction()
  const remove = () => {
    const note = clientCount > 0
      ? `\n担当中のクライアント${clientCount}名は ${name} さんに残ります。チームに残したい場合は、先に担当替えしてください。`
      : ''
    if (window.confirm(`${name} さんをチームから外しますか？${note}`)) run({ action: 'remove', membership_id: membershipId })
  }
  return (
    <div>
      <button onClick={remove} disabled={busy} className="text-sm text-red-500 hover:text-red-600 underline disabled:opacity-50">外す</button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function LeaveTeamButton({ pending }: { pending: boolean }) {
  const { busy, error, run } = useTeamAction()
  const leave = () => {
    const message = pending
      ? '参加の申請を取り消しますか？'
      : 'チームを抜けますか？\n担当中のクライアントはそのまま残りますが、ご自身のプラン（スタータープランなら3名まで）に戻ります。'
    if (window.confirm(message)) run({ action: 'leave' })
  }
  return (
    <div className="space-y-1">
      <button onClick={leave} disabled={busy} className="w-full py-3 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-500 cursor-pointer hover:bg-red-50 hover:border-red-400 disabled:opacity-50">
        {pending ? '申請を取り消す' : 'チームを抜ける'}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function ReassignSelect({ linkId, currentTrainerId, trainers }: { linkId: string; currentTrainerId: string; trainers: { id: string; name: string }[] }) {
  const { busy, error, run } = useTeamAction()
  const [to, setTo] = useState(currentTrainerId)
  const current = trainers.find(t => t.id === currentTrainerId)
  const submit = () => {
    const target = trainers.find(t => t.id === to)
    if (!target || to === currentTrainerId) return
    if (window.confirm(`担当を ${current?.name ?? '今のトレーナー'} さんから ${target.name} さんに替えますか？\n契約・プラン・記録はそのまま引き継がれます。`)) run({ action: 'reassign', link_id: linkId, to_trainer: to })
  }
  return (
    <div className="px-5 py-4 rounded-2xl trainer-card space-y-2">
      <p className="text-xs font-semibold text-zinc-400">担当のトレーナー</p>
      <div className="flex gap-2">
        <select value={to} onChange={e => setTo(e.target.value)} disabled={busy} className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-black">
          {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={submit} disabled={busy || to === currentTrainerId} className={secondaryClass}>担当替え</button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
