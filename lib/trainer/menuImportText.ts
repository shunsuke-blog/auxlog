// メニューのインポートで、選んだファイルをブラウザの中でテキストにする（2026-10-28。ファイル自体はサーバーに送らない）。
// .xlsx は ZIP の中の XML を読む（ライブラリは使わない）。シートごとに「### シート: 名前」の見出しを付けた CSV にする。
// 結合セルは左上のセルだけに値が入る（Gemini には「空欄は上の行と同じ」と伝えてある）。
// .csv・.tsv・.txt は文字コードを判定して読む（Excel の CSV は Shift_JIS のことが多い）。

export class UnsupportedFileError extends Error {}

export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  if (/\.(csv|tsv|txt)$/.test(name)) return decodeText(buf)
  if (name.endsWith('.xlsx')) return xlsxToText(buf)
  if (name.endsWith('.xls')) throw new UnsupportedFileError('古い形式（.xls）は読めません。Excel で「.xlsx」として保存し直してから選んでください')
  throw new UnsupportedFileError('Excel（.xlsx）か CSV のファイルを選んでください')
}

/** UTF-8 として読めなければ Shift_JIS として読む */
export function decodeText(buf: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    text = new TextDecoder('shift_jis').decode(buf)
  }
  return text.replace(/^﻿/, '')
}

// ---- ZIP ----

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** ZIP から名前が条件に合うファイルを取り出す（ZIP64・暗号化には対応しない） */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new UnsupportedFileError('ファイルを開けませんでした。Excel（.xlsx）のファイルか確かめてください')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const utf8 = new TextDecoder('utf-8')
  const out = new Map<string, string>()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const local = view.getUint32(p + 42, true)
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!wanted(name)) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const raw = bytes.subarray(start, start + size)
    if (method !== 0 && method !== 8) throw new UnsupportedFileError('このファイルの形式には対応していません')
    out.set(name, utf8.decode(method === 8 ? await inflateRaw(raw) : raw))
  }
  return out
}

// ---- XML（決まった形のものだけなので正規表現で読む） ----

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'"
      : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)))

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decodeXml(m[2])]))

/** <si> や <is> の中の文字。ふりがな（<rPh>）は除く */
const richText = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('')

/** 列の文字（A, B, …, AA）を 0 始まりの番号に */
const colIndex = (ref: string) => {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// 組み込みの日付・時刻の書式（日本語の Excel での見え方）
const BUILTIN_DATE_FORMATS: Record<number, string> = {
  14: 'yyyy/m/d', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy/m/d h:mm', 45: 'mm:ss', 46: '[h]:mm:ss',
  55: 'yyyy/m/d', 56: 'yyyy/m/d', 57: 'yyyy/m/d', 58: 'm/d',
}

/** セルの書式（cellXfs の番号 → パーセント、または日付・時刻の書式） */
type CellFormats = { pct: Set<number>; date: Map<number, string> }

function cellFormats(stylesXml: string | undefined): CellFormats {
  const formats: CellFormats = { pct: new Set(), date: new Map() }
  if (!stylesXml) return formats
  const custom = new Map(
    [...stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)].map(m => attrs(m[1])).map(a => [Number(a.numFmtId), a.formatCode ?? '']),
  )
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  ;[...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].forEach((m, i) => {
    const id = Number(attrs(m[1]).numFmtId ?? 0)
    const code = custom.get(id)
    if (id === 9 || id === 10 || code?.includes('%')) formats.pct.add(i)
    else if (BUILTIN_DATE_FORMATS[id]) formats.date.set(i, BUILTIN_DATE_FORMATS[id])
    // 自作の書式は、文字列（"…"）・[…]・\x を除いて y・m・d・h・s があれば日付・時刻
    else if (code && /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''))) formats.date.set(i, code)
  })
  return formats
}

/** 日付・時刻のシリアル値を書式どおりの文字にする（年・月・日・時・分・秒だけ。曜日・午前午後などは扱わない） */
export function formatDateSerial(serial: number, code: string): string {
  const ms = Math.round(serial * 86400000)
  const d = new Date(Date.UTC(1899, 11, 30) + ms)
  const totalHours = Math.floor(ms / 3600000)
  const fmt = code.split(';')[0].replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, '').replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1')
  const tokens = [...fmt.matchAll(/\[h+\]|\[m+\]|\[s+\]|y+|m+|d+|h+|s+|[^ymdhs[]+|\[/gi)].map(m => m[0])
  const pad = (n: number, len: number) => String(n).padStart(len, '0')
  return tokens.map((t, i) => {
    const lower = t.toLowerCase()
    // m は前に h、後ろに s があれば「分」
    const isMinute = lower[0] === 'm' && (/h/i.test(tokens.slice(0, i).reverse().find(x => /^[\[ymdhs]/i.test(x)) ?? '') || /^s/i.test(tokens.slice(i + 1).find(x => /^[\[ymdhs]/i.test(x)) ?? ''))
    if (lower.startsWith('[h')) return String(totalHours)
    if (lower.startsWith('[m')) return String(Math.floor(ms / 60000))
    if (lower.startsWith('[s')) return String(Math.floor(ms / 1000))
    if (lower[0] === 'y') return lower.length <= 2 ? pad(d.getUTCFullYear() % 100, 2) : String(d.getUTCFullYear())
    if (lower[0] === 'm' && isMinute) return pad(d.getUTCMinutes(), lower.length)
    if (lower[0] === 'm') return lower.length >= 2 ? pad(d.getUTCMonth() + 1, 2) : String(d.getUTCMonth() + 1)
    if (lower[0] === 'd') return lower.length >= 2 ? pad(d.getUTCDate(), 2) : String(d.getUTCDate())
    if (lower[0] === 'h') return pad(d.getUTCHours(), lower.length)
    if (lower[0] === 's') return pad(d.getUTCSeconds(), lower.length)
    return t
  }).join('')
}

const formatNumber = (n: number) => String(Math.round(n * 1e9) / 1e9)

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

function sheetToCsv(xml: string, shared: string[], formats: CellFormats): string {
  const rows: string[][] = []
  let rowSeq = 0
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(rm[1])
    const r = ra.r ? Number(ra.r) - 1 : rowSeq
    rowSeq = r + 1
    const cells: string[] = []
    let colSeq = 0
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(cm[1])
      const c = ca.r ? colIndex(ca.r) : colSeq
      colSeq = c + 1
      const inner = cm[2] ?? ''
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let text = ''
      if (ca.t === 's') text = v != null ? shared[Number(v)] ?? '' : ''
      else if (ca.t === 'inlineStr') text = richText(inner)
      else if (ca.t === 'str' || ca.t === 'e') text = v != null ? decodeXml(v) : ''
      else if (ca.t === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
      else if (v != null) {
        const n = Number(v)
        const style = Number(ca.s ?? 0)
        const date = formats.date.get(style)
        // 日付・時刻は画面の見え方どおり（「3-4」と入れたインターバルが日付になっている表があった、2026-10-28）
        text = !Number.isFinite(n) ? decodeXml(v)
          : formats.pct.has(style) ? `${formatNumber(n * 100)}%`
          : date ? formatDateSerial(n, date)
          : formatNumber(n)
      }
      cells[c] = text
    }
    rows[r] = cells
  }
  const lines = Array.from({ length: rows.length }, (_, i) => {
    const cells = Array.from(rows[i] ?? [], x => x ?? '')
    while (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop()
    return cells.map(csvCell).join(',')
  })
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

export async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const files = await unzip(buf, n => n.startsWith('xl/') && n.endsWith('.xml') || n === 'xl/_rels/workbook.xml.rels')
  const workbook = files.get('xl/workbook.xml')
  if (!workbook) throw new UnsupportedFileError('ファイルを開けませんでした。Excel（.xlsx）のファイルか確かめてください')
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => richText(m[1]))
  const formats = cellFormats(files.get('xl/styles.xml'))
  const targets = new Map(
    [...(files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)].map(m => {
      const a = attrs(m[1])
      return [a.Id, a.Target?.startsWith('/') ? a.Target.slice(1) : `xl/${a.Target}`]
    }),
  )
  const out: string[] = []
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1])
    // 非表示のシートは読まない
    if (a.state === 'hidden' || a.state === 'veryHidden') continue
    const xml = files.get(targets.get(a['r:id']) ?? '')
    if (!xml) continue
    const csv = sheetToCsv(xml, shared, formats)
    if (csv.trim()) out.push(`### シート: ${a.name}\n${csv}`)
  }
  return out.join('\n\n')
}
