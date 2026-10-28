// メニューのインポート（2026-10-28）。トレーナーの表（Excel・CSV・貼り付け）を Gemini で決まった形に直し、
// 確認の画面 → 下書きの編集画面に渡す。ここは画面とサーバーの両方で使う型と変換（Gemini の呼び出しは menuImportGemini.ts）。
// 試作と精度の確認は docs/menu_import_samples/prototype_gemini.mjs

import { exerciseIdOf, isCardioExercise, newKey, type CatalogExercise, type EditorExercise, type EditorSet } from './templateEditor'

/** 1シートの文字数の上限（シートごとに同時に読むので、時間は一番大きいシート1枚で決まる。2万文字で1〜2分ほど） */
export const MAX_IMPORT_CHARS = 20000
/** 表全体の文字数とシート数の上限 */
export const MAX_IMPORT_TOTAL_CHARS = 200000
export const MAX_IMPORT_SHEETS = 20

/** ファイルをテキストにした時のシートの見出し（menuImportText.ts が付ける） */
export const SHEET_HEADING = /^### シート: (.*)$/m

/** 表のテキストをシートごとに分ける（見出しが無ければ全体で1つ） */
export function splitSheets(text: string): { name: string | null; text: string }[] {
  const parts = text.split(/^(?=### シート: )/m).filter(p => p.trim())
  return parts.map(p => ({ name: p.match(SHEET_HEADING)?.[1].trim() ?? null, text: p.trim() }))
}
/** テンプレートに入る週・Day（create_plan_template と同じ） */
export const MAX_IMPORT_WEEKS = 16
export const MAX_IMPORT_DAYS = 7

export type ImportedSet = { count: number; kg: number | null; pct: number | null; reps: number | null; rir: number | null; warmup: boolean }

export type ImportedExercise = {
  /** 表に書かれていた種目名 */
  sourceName: string
  /** 一覧の種目のキー（exerciseIdOf の形。m:… / c:… / t:…）。一覧に無ければ null */
  matchKey: string | null
  /** 略称・英語名などから推測して選んだか */
  matchGuessed: boolean
  cardio: boolean
  sets: ImportedSet[]
  minutes: number | null
  km: number | null
  note: string | null
  /** 推測で埋めた項目（sets, reps, weight など） */
  guessed: string[]
  /** 意味が読み取れなかったセルの文字 */
  unreadable: string[]
}

export type ImportedDay = { week: number; day: number; label: string | null; exercises: ImportedExercise[] }

export type MenuImportResult = { days: ImportedDay[]; warnings: string[]; remaining: number }

/** 週・Day がテンプレートに入るか（16週・7日まで） */
export const fitsTemplate = (d: { week: number; day: number }) =>
  d.week >= 1 && d.week <= MAX_IMPORT_WEEKS && d.day >= 1 && d.day <= MAX_IMPORT_DAYS

// ---- Gemini の返す形（項目名は短くして出力を減らす。全項目を必須にする: 省いてよい形にすると出力が壊れたり値が抜けたりした） ----

const N = (type: string, description: string) => ({ type, nullable: true, description })

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          w: { type: 'integer', description: '週' },
          d: { type: 'integer', description: 'Day' },
          label: N('string', '「上半身」など Day の名前'),
          ex: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '表に書かれている種目名そのまま' },
                id: N('string', '一覧の ID。同じ種目が無ければ null'),
                g: { type: 'boolean', description: '略称・英語名などから推測して選んだ時 true' },
                cardio: { type: 'boolean', description: '有酸素か' },
                sets: {
                  type: 'array',
                  description: '有酸素は空',
                  items: {
                    type: 'object',
                    properties: {
                      c: { type: 'integer', description: '同じ内容のセットの数（「×3セット」なら 3）' },
                      kg: N('number', 'kg で書かれた重量。自重・空欄・%の時は null'),
                      pct: N('number', '「75%」のような 1RM に対する割合（75）'),
                      reps: N('integer', '回数。秒で行う種目は秒数。MAX など数字でない時は null'),
                      rir: N('number', 'RIR。RPE で書かれていたら 10 - RPE'),
                      wu: { type: 'boolean', description: 'ウォームアップか' },
                    },
                    required: ['c', 'kg', 'pct', 'reps', 'rir', 'wu'],
                  },
                },
                min: N('number', '有酸素の目標時間（分）'),
                km: N('number', '有酸素の目標距離（km）'),
                note: N('string', '数値の欄に入らない指示'),
                guess: { type: 'array', items: { type: 'string' }, description: '推測で埋めた項目名' },
                bad: { type: 'array', items: { type: 'string' }, description: '意味が読み取れなかったセルの文字そのまま' },
              },
              required: ['name', 'id', 'g', 'cardio', 'sets', 'min', 'km', 'note', 'guess', 'bad'],
            },
          },
        },
        required: ['w', 'd', 'label', 'ex'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: '取り込めなかった行や、表全体についての注意' },
  },
  required: ['days', 'warnings'],
} as const

/** Gemini への指示。一覧は短い ID（m1・c1・t1…）と名前で渡す */
/** sheet: シートごとに分けて読む時の、今読むシートの名前と全シートの名前 */
export function buildInstruction(list: { shortId: string; name: string }[], sheet?: { name: string; all: string[] }) {
  return `あなたはパーソナルトレーナーのトレーニングメニュー表を、決まった形に直す担当です。
表は Excel・CSV をテキストにしたもの（シートごとに「### シート: 名前」）か、貼り付けた文字で、トレーナーごとに書き方がばらばらです。

## 直し方
- 週と Day を読み取る。シート名・見出し行（「■ Week 1」「【上半身】」）・列（W1, W2…）・結合セル（空欄は上の行と同じ）のどれで区切られていても対応する。
- 週の区切りが無ければ、すべて1週目とする。
- Day 番号が無く「上半身」「A」のような名前だけなら、出てきた順に 1, 2… と番号を振り、名前は label に入れる。
- 表に書かれている週だけを出す。書かれていない週を推測で増やさない（「8週間」と書いてあっても表が2週分なら2週）。
- 同じ内容のセットは1つにまとめて c に数を入れる（「3セット」なら c: 3）。内容が違うセットは分ける。「60kg×8×3」は 60kg・8回・3セット。ウォームアップは wu を true にして先頭に置く。
- 重量の単位が無い数字は kg とみなす。「%」は pct。「自重」「BW」は kg を null にする。
- RPE（「@8」など）は rir = 10 - RPE に直す。RIR と書いてあればそのまま。
- 回数が「10~12」のような範囲だけで書かれていたら、小さい方を reps に入れ、範囲は note に残す。
- 秒で行う種目（プランク等）は reps に秒数を入れる。
- 有酸素（ラン・バイク・ローイング等）は cardio を true、sets は空にする。「15分」「20分」は必ず min、「5km」「2000m」は必ず km（2000m → 2）に入れる。傾斜・心拍・速度などの条件は note に入れる（bad ではない）。
- 数値の欄に入らない指示（休憩時間・ドロップセット・MAX回・左右・補助あり等）は note に短く残す。
- 推測で埋めた値は guess に、意味が読み取れないセルは bad にそのまま入れる。でたらめに埋めない。
- 個人名などメニューと関係ない行は無視する。
${sheet ? `
## このシートについて
表は複数のシートに分かれていて、ここではシート「${sheet.name}」だけを渡している（全シート: ${sheet.all.join('、')}）。
- 週・Day は表全体での番号にする。シート名が週（「WEEK03」「3週目」など）なら、その週の番号にする。
- メニューが書かれていないシート（個人情報・集計・説明など）なら、days も warnings も空にする。
` : ''}
## 種目の突き合わせ
下の一覧から同じ種目の ID を id に入れる。略称（BP=ベンチプレス、SQ=スクワット、RDL=ルーマニアンデッドリフト、DB=ダンベル、OHP=オーバーヘッドプレス）や英語名も同じ種目なら選んでよい。その場合は g を true。
同じ種目が一覧に無ければ id は null にする（似ているだけの別の種目を選ばない）。

## 種目の一覧
${list.map(e => `${e.shortId}: ${e.name}`).join('\n')}`
}

/** 一覧に短い ID を振る（m=種目マスタ、c=有酸素、t=トレーナーの独自種目）。短い ID → 種目のキー の対応も返す */
export function shortIdsFor(catalog: CatalogExercise[]) {
  const counters = { m: 0, c: 0, t: 0 }
  const list: { shortId: string; name: string }[] = []
  const keyOf = new Map<string, string>()
  for (const ex of catalog) {
    const key = exerciseIdOf(ex)
    const kind = key[0] as 'm' | 'c' | 't'
    const shortId = `${kind}${++counters[kind]}`
    list.push({ shortId, name: ex.name })
    keyOf.set(shortId, key)
  }
  return { list, keyOf }
}

// ---- Gemini の出力 → 取り込み結果 ----

type RawSet = { c?: unknown; kg?: unknown; pct?: unknown; reps?: unknown; rir?: unknown; wu?: unknown }
type RawExercise = { name?: unknown; id?: unknown; g?: unknown; cardio?: unknown; sets?: unknown; min?: unknown; km?: unknown; note?: unknown; guess?: unknown; bad?: unknown }
type RawDay = { w?: unknown; d?: unknown; label?: unknown; ex?: unknown }

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)
const int = (v: unknown, min: number, max: number) => { const n = num(v, min, max); return n == null ? null : Math.round(n) }
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const strs = (v: unknown) => (Array.isArray(v) ? v.map(x => str(x, 100)).filter((x): x is string => x != null) : [])
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Gemini の出力を確かめて取り込み結果の形にする（おかしな値は捨てる）。同じ週・Day が2回出たらつなげる */
export function normalizeGeminiOutput(raw: unknown, keyOf: Map<string, string>): Omit<MenuImportResult, 'remaining'> {
  const obj = (raw ?? {}) as { days?: unknown; warnings?: unknown }
  const byDay = new Map<string, ImportedDay>()
  for (const d of arr(obj.days) as RawDay[]) {
    const week = int(d.w, 1, 99)
    const day = int(d.d, 1, 99)
    if (week == null || day == null) continue
    const exercises: ImportedExercise[] = []
    for (const e of arr(d.ex) as RawExercise[]) {
      const sourceName = str(e.name, 60)
      if (!sourceName) continue
      const matchKey = typeof e.id === 'string' ? keyOf.get(e.id.trim()) ?? null : null
      exercises.push({
        sourceName,
        matchKey,
        matchGuessed: matchKey != null && e.g === true,
        cardio: e.cardio === true,
        sets: (arr(e.sets) as RawSet[]).map(s => ({
          count: int(s.c, 1, 20) ?? 1,
          kg: num(s.kg, 0.01, 999),
          pct: num(s.pct, 1, 120),
          reps: int(s.reps, 1, 999),
          rir: num(s.rir, 0, 10),
          warmup: s.wu === true,
        })),
        minutes: num(e.min, 0.1, 1440),
        km: num(e.km, 0.01, 1000),
        note: str(e.note, 200),
        guessed: strs(e.guess),
        unreadable: strs(e.bad),
      })
    }
    const k = `${week}-${day}`
    const prev = byDay.get(k)
    if (prev) prev.exercises.push(...exercises)
    else byDay.set(k, { week, day, label: str(d.label, 30), exercises })
  }
  const days = [...byDay.values()].sort((a, b) => a.week - b.week || a.day - b.day)
  return { days, warnings: strs(obj.warnings) }
}

// ---- 確認の画面: 表の種目名ごとに、どの種目として取り込むか ----

export type SourceExercise = {
  sourceName: string
  /** Gemini が選んだ種目（同じ名前で違う種目を選んだ時は多い方） */
  matchKey: string | null
  matchGuessed: boolean
  cardio: boolean
  /** 表に出てくる回数（テンプレートに入らない週・Day を除く） */
  count: number
}

/** 表に出てくる種目名の一覧（出てくる順） */
export function sourceExercises(days: ImportedDay[]): SourceExercise[] {
  const groups = new Map<string, ImportedExercise[]>()
  for (const d of days.filter(fitsTemplate)) for (const e of d.exercises) {
    groups.set(e.sourceName, [...(groups.get(e.sourceName) ?? []), e])
  }
  return [...groups.entries()].map(([sourceName, list]) => {
    const votes = new Map<string | null, number>()
    for (const e of list) votes.set(e.matchKey, (votes.get(e.matchKey) ?? 0) + 1)
    const matchKey = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return {
      sourceName,
      matchKey,
      matchGuessed: list.some(e => e.matchKey === matchKey && e.matchGuessed),
      cardio: list.some(e => e.cardio),
      count: list.length,
    }
  })
}

/** 表の種目名ごとの取り込み先。'skip' は取り込まない */
export type Resolutions = Record<string, CatalogExercise | 'skip' | undefined>

// ---- 下書き（編集画面に渡す形） ----

export type DraftDay = { id: string; weekNumber: number; dayNumber: number; label: string | null; exercises: EditorExercise[] }
export type ImportDraft = { totalWeeks: number; daysPerWeek: number; days: DraftDay[] }

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function toEditorSets(sets: ImportedSet[], target: CatalogExercise): { sets: EditorSet[]; notes: string[] } {
  const out: EditorSet[] = []
  const notes = new Set<string>()
  for (const s of sets) {
    let mode: EditorSet['mode'] = 'auto'
    let value = ''
    if (s.pct != null && target.requiresOneRm) { mode = 'pct'; value = fmt(s.pct) }
    // 1RM管理外の種目は %1RM から重量を出せないので「自動」にし、表の%はメモに残す（入れ替えの時と同じ考え方）
    else if (s.pct != null) notes.add(`${fmt(s.pct)}%`)
    else if (s.kg != null) { mode = 'kg'; value = fmt(s.kg) }
    const set: EditorSet = {
      mode, value,
      reps: s.reps != null ? String(s.reps) : '',
      // RIR は整数で持つ（RPE 8.5 → RIR 1.5 は 2 に丸める）
      rir: s.rir != null ? String(Math.round(s.rir)) : '',
      isWarmup: s.warmup,
    }
    for (let i = 0; i < s.count; i++) out.push({ ...set })
  }
  return { sets: out.slice(0, 20), notes: [...notes] }
}

/** 取り込み結果と確認の画面での選択から、下書き（編集画面の Day の一覧）を作る。テンプレートに入らない週・Day は除く */
export function buildDraft(days: ImportedDay[], resolutions: Resolutions): ImportDraft {
  const fit = days.filter(fitsTemplate)
  const totalWeeks = Math.max(1, ...fit.map(d => d.week))
  const daysPerWeek = Math.max(1, ...fit.map(d => d.day))
  const byKey = new Map(fit.map(d => [`${d.week}-${d.day}`, d]))
  const out: DraftDay[] = []
  for (let w = 1; w <= totalWeeks; w++) for (let d = 1; d <= daysPerWeek; d++) {
    const src = byKey.get(`${w}-${d}`)
    const exercises: EditorExercise[] = []
    for (const e of src?.exercises ?? []) {
      const target = resolutions[e.sourceName]
      if (!target || target === 'skip') continue
      const notes = e.note ? [e.note] : []
      if (e.unreadable.length > 0) notes.push(`表の記載: ${e.unreadable.join('、')}`)
      const base = {
        key: newKey(),
        exerciseMasterId: target.exerciseMasterId,
        trainerExerciseId: target.trainerExerciseId,
        cardioMasterId: target.cardioMasterId ?? null,
        name: target.name,
        targetMuscle: target.targetMuscle,
      }
      if (isCardioExercise(target)) {
        exercises.push({ ...base, note: notes.join('\n').slice(0, 200), sets: [], targetMinutes: e.minutes != null ? fmt(e.minutes) : '', targetDistanceKm: e.km != null ? fmt(e.km) : '' })
      } else {
        const { sets, notes: setNotes } = toEditorSets(e.sets, target)
        exercises.push({ ...base, note: [...setNotes, ...notes].join('\n').slice(0, 200), sets })
      }
    }
    out.push({ id: `draft-${w}-${d}`, weekNumber: w, dayNumber: d, label: src?.label ?? null, exercises: exercises.slice(0, 30) })
  }
  return { totalWeeks, daysPerWeek, days: out }
}
