'use client'

import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { MAX_IMPORT_CHARS, MAX_IMPORT_SHEETS, MAX_IMPORT_TOTAL_CHARS, splitSheets, type MenuImportResult } from '@/lib/trainer/menuImport'
import { UnsupportedFileError, fileToText } from '@/lib/trainer/menuImportText'
import type { CatalogExercise } from '@/lib/trainer/templateEditor'

export type MenuImportResponse = MenuImportResult & { catalog: CatalogExercise[] }

// 新しいテンプレートの「表から取り込む」タブ（2026-10-28）。表を選ぶか貼り付けて、AI で読み取る。
// 読み取れたら onRead で確認の画面（ImportFlow）に進む
export default function ImportInput({ onRead, onCancel, onBusyChange }: {
  onRead: (result: MenuImportResponse, fileName: string | null) => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  // 読み取らないシート（個人情報・集計など。外すと Gemini に送らず、速く安く読める）
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [reading, setReading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const sheets = file ? splitSheets(file.text) : []
  const selected = sheets.filter(s => !excluded.has(s.name ?? ''))
  const text = file ? selected.map(s => s.text).join('\n\n') : pasted
  // シートごとに同時に読むので、上限はシート1枚あたり（貼り付けは全体で1つ）
  const sizeError = file
    ? selected.length > MAX_IMPORT_SHEETS ? `シートが多すぎます（${MAX_IMPORT_SHEETS}枚まで）。使わないシートを外してください`
      : selected.find(s => s.text.length > MAX_IMPORT_CHARS) ? `シート「${selected.find(s => s.text.length > MAX_IMPORT_CHARS)!.name}」が大きすぎます（1枚${MAX_IMPORT_CHARS.toLocaleString()}文字まで）。使わない行や列を消してください`
      : text.length > MAX_IMPORT_TOTAL_CHARS ? `表が大きすぎます（全体で${MAX_IMPORT_TOTAL_CHARS.toLocaleString()}文字まで）。使わないシートを外してください`
      : null
    : pasted.length > MAX_IMPORT_CHARS ? `表が大きすぎます（${pasted.length.toLocaleString()}文字、${MAX_IMPORT_CHARS.toLocaleString()}文字まで）。使わない行や列を消してから貼り付けてください`
      : null

  // 読み取り中に閉じると、1日の回数を使ったまま結果が消える
  useEffect(() => {
    if (!reading) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(timer)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [reading])

  const pickFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    try {
      const t = await fileToText(f)
      if (!t.trim()) throw new UnsupportedFileError('ファイルの中に表が見つかりませんでした')
      setFile({ name: f.name, text: t })
      setExcluded(new Set())
      setPasted('')
    } catch (e) {
      setFile(null)
      setError(e instanceof UnsupportedFileError ? e.message : 'ファイルを読めませんでした。Excel（.xlsx）か CSV のファイルか確かめてください')
    }
  }

  const read = async () => {
    setError(null)
    setElapsed(0)
    setReading(true)
    onBusyChange(true)
    try {
      const res = await fetch('/api/trainer/menu-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json().catch(() => ({})) as Partial<MenuImportResponse> & { error?: string }
      if (typeof data.remaining === 'number') setRemaining(data.remaining)
      if (!res.ok || !data.days || !data.catalog) throw new Error(data.error ?? '表の読み取りに失敗しました。もう一度お試しください')
      onRead(data as MenuImportResponse, file?.name ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '表の読み取りに失敗しました')
    } finally {
      setReading(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        <p>今お使いのメニュー表（Excel・CSV）を AI が読み取って、テンプレートの下書きを作ります。</p>
        <p>書き方は自由です。週・Day・種目・重量・回数・セット数が分かれば読み取れます。</p>
      </div>
      <div className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        表の中身は、読み取りのために AI（Google Gemini）へ送られます。<span className="font-semibold">クライアントの名前など、個人が分かる情報は表から消してから</span>取り込んでください。
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!reading) pickFile(e.dataTransfer.files[0]) }}
        className={`rounded-xl border border-dashed px-4 py-4 flex flex-col items-center gap-2 text-center ${dragging ? 'border-zinc-500 bg-zinc-100 dark:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700'}`}
      >
        <FileSpreadsheet className="w-5 h-5 text-zinc-400" />
        {file ? (
          <div>
            <p className="text-sm font-semibold text-black dark:text-white break-all">{file.name}</p>
            <p className="text-xs text-zinc-500">{sheets.length > 1 && `${sheets.length}シート・`}{file.text.length.toLocaleString()}文字</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Excel（.xlsx）・CSV のファイルをここにドロップ</p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={reading} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
            {file ? '別のファイルを選ぶ' : 'ファイルを選ぶ'}
          </button>
          {/* 取り消すと貼り付けの欄に戻る */}
          {file && (
            <button type="button" onClick={() => { setFile(null); setError(null) }} disabled={reading} className="px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-black dark:hover:text-white disabled:opacity-50">
              取り消す
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>

      {sheets.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">読み取るシート（押すと外せます。個人情報・集計などメニューでないシートは外してください）</p>
          <div className="flex flex-wrap gap-1.5">
            {sheets.map(sh => {
              const name = sh.name ?? ''
              const off = excluded.has(name)
              return (
                <button
                  key={name}
                  type="button"
                  disabled={reading}
                  onClick={() => setExcluded(prev => { const n = new Set(prev); if (off) n.delete(name); else n.add(name); return n })}
                  className={`px-2.5 py-1 rounded-full border text-xs ${off ? 'border-zinc-200 dark:border-zinc-800 text-zinc-400 line-through' : 'border-zinc-800 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white font-medium'}`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ファイルを選んだら貼り付けは使わないので出さない */}
      {!file && (
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">または、表をコピーして貼り付け</span>
        <textarea
          value={pasted}
          onChange={e => { setPasted(e.target.value); if (e.target.value) setFile(null) }}
          disabled={reading}
          rows={4}
          placeholder={'Day1\tベンチプレス\t60kg\t8回\t3セット\n…'}
          className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white placeholder:text-zinc-400 focus:outline-none font-mono"
        />
      </label>
      )}

      {sizeError && <p className="text-sm text-red-500">{sizeError}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {reading
          ? '30秒ほどかかります。大きな表は数分かかることがあります。閉じずにお待ちください。'
          : `読み取りは30秒ほどかかります（1日20回まで${remaining != null ? `、今日はあと${remaining}回` : ''}）。`}
      </p>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={reading} className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
          キャンセル
        </button>
        <button type="button" onClick={read} disabled={reading || !text.trim() || !!sizeError} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand hover:bg-brand-hover text-sm font-medium text-on-brand disabled:opacity-50">
          {reading && <Loader2 className="w-4 h-4 animate-spin" />}
          {reading ? `読み取り中…（${elapsed}秒）` : '読み取る'}
        </button>
      </div>
    </div>
  )
}
