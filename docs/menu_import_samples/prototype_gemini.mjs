// メニューのインポートの試作: 表のテキスト → Gemini（responseSchema）→ 決まった形
// 使い方: THINK=low OUT_DIR=<作業用フォルダ> node prototype_gemini.mjs gemini-3.8-flash <表のテキスト>...
// 2026-10-28 の試作。全部の項目を必ず書かせる（省いてよい形にすると出力が壊れたり値が抜けたりした）、セットは c でまとめる、短い項目名、thinkingLevel low
import fs from 'node:fs'
import path from 'node:path'

const envText = fs.readFileSync('/Users/y-syunsuke/dev/auxlog/.env.local', 'utf8')
const KEY = envText.split('\n').find(l => l.startsWith('GEMINI_API_KEY=')).slice(15).trim()
const dir = process.env.OUT_DIR ?? path.dirname(new URL(import.meta.url).pathname) // catalog.json（exercise_master・cardio_master の id/name）と結果の置き場所
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'))

// 一覧は短い ID で渡す（m=種目マスタ、c=有酸素、t=トレーナーの独自種目）
const list = [
  ...catalog.master.map((e, i) => ({ id: `m${i + 1}`, name: e.name, cardio: false })),
  ...catalog.cardio.map((e, i) => ({ id: `c${i + 1}`, name: e.name, cardio: true })),
]
const listText = list.map(e => `${e.id}: ${e.name}`).join('\n')

const MAX_WEEKS = 16, MAX_DAYS = 7

const N = (type, description) => ({ type, nullable: true, description })
const setSchema = {
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
}

const schema = {
  type: 'object',
  properties: {
    total_weeks: { type: 'integer', description: '表に書かれている週の数' },
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
                sets: { type: 'array', items: setSchema, description: '有酸素は空' },
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
  required: ['total_weeks', 'days', 'warnings'],
}

const instruction = `あなたはパーソナルトレーナーのトレーニングメニュー表を、決まった形に直す担当です。
表は Excel・CSV をテキストにしたもので、トレーナーごとに書き方がばらばらです。

## 直し方
- 週と Day を読み取る。シート名・見出し行（「■ Week 1」「【上半身】」）・列（W1, W2…）・結合セル（空欄は上の行と同じ）のどれで区切られていても対応する。
- Day 番号が無く「上半身」「A」のような名前だけなら、出てきた順に 1, 2… と番号を振り、名前は label に入れる。
- 表に書かれている週だけを出す。書かれていない週を推測で増やさない（「8週間」と書いてあっても表が2週分なら2週）。
- 同じ内容のセットは1つにまとめて c に数を入れる（「3セット」なら c: 3）。内容が違うセットは分ける。「60kg×8×3」は 60kg・8回・3セット。ウォームアップは wu を true にして先頭に置く。
- 重量の単位が無い数字は kg とみなす。「%」は pct。「自重」「BW」は kg を null にする。
- RPE（「@8」など）は rir = 10 - RPE に直す。RIR と書いてあればそのまま。
- 秒で行う種目（プランク等）は reps に秒数を入れる。
- 有酸素（ラン・バイク・ローイング等）は cardio を true、sets は空にする。「15分」「20分」は必ず min、「5km」「2000m」は必ず km（2000m → 2）に入れる。傾斜・心拍・速度などの条件は note に入れる（bad ではない）。
- 数値の欄に入らない指示（休憩時間・ドロップセット・MAX回・左右・補助あり等）は note に短く残す。
- 推測で埋めた値は guess に、意味が読み取れないセルは bad にそのまま入れる。でたらめに埋めない。
- 個人名などメニューと関係ない行は無視する。

## 種目の突き合わせ
下の一覧から同じ種目の ID を id に入れる。略称（BP=ベンチプレス、SQ=スクワット、RDL=ルーマニアンデッドリフト、DB=ダンベル、OHP=オーバーヘッドプレス）や英語名も同じ種目なら選んでよい。その場合は g を true。
同じ種目が一覧に無ければ id は null にする（似ているだけの別の種目を選ばない）。

## 種目の一覧
${listText}`

async function run(model, file) {
  const text = fs.readFileSync(file, 'utf8')
  const t0 = Date.now()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...(process.env.THINK ? { thinkingConfig: { thinkingLevel: process.env.THINK } } : {}) },
    }),
  })
  const body = await res.json()
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  if (!res.ok) { console.log(`[${path.basename(file)}] ${res.status} ${JSON.stringify(body).slice(0, 300)}`); return }
  const out = JSON.parse(body.candidates[0].content.parts.map(p => p.text ?? '').join(''))
  const u = body.usageMetadata
  const base = path.basename(file, '.txt')
  fs.writeFileSync(path.join(dir, `out_${model}_${process.env.THINK ?? 'default'}_${base}.json`), JSON.stringify(out, null, 2))
  console.log(`\n===== ${base}（${model}${process.env.THINK ? ' think=' + process.env.THINK : ''}・${sec}秒・入力${u.promptTokenCount}/出力${u.candidatesTokenCount}/思考${u.thoughtsTokenCount ?? 0} トークン）`)
  console.log(`週数 ${out.total_weeks}${out.warnings.length ? '  注意: ' + out.warnings.join(' / ') : ''}`)
  const byId = new Map(list.map(e => [e.id, e.name]))
  for (const d of out.days) {
    const over = d.w > MAX_WEEKS || d.d > MAX_DAYS ? '  ←入りません' : ''
    console.log(`W${d.w} D${d.d}${d.label ? `（${d.label}）` : ''}${over}`)
    for (const e of d.ex) {
      const m = e.id ? `${byId.get(e.id) ?? '?' + e.id}${e.g ? '（推測）' : ''}` : '【一覧に無い】'
      const sets = e.cardio
        ? `${e.min ?? '-'}分 ${e.km ?? '-'}km`
        : e.sets.map(s => `${s.c}×[${s.wu ? 'W:' : ''}${s.pct != null ? s.pct + '%' : s.kg ?? '自重'}×${s.reps ?? '?'}${s.rir != null ? ' RIR' + s.rir : ''}]`).join(', ')
      const flags = [e.note && `メモ:${e.note}`, e.guess.length && `推測:${e.guess.join(',')}`, e.bad.length && `読めない:${e.bad.join(',')}`].filter(Boolean).join(' ')
      console.log(`  ${e.name} → ${m} | ${sets}${flags ? ' | ' + flags : ''}`)
    }
  }
}

const [model, ...files] = process.argv.slice(2)
await Promise.all(files.map(f => run(model, f).catch(err => console.log(`[${f}] ${err}`))))
