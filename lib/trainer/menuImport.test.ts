// メニューのインポート（2026-10-28）のテスト。実行: npx tsx --test lib/trainer/menuImport.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildDraft, normalizeGeminiOutput, shortIdsFor, sourceExercises, splitSheets, type ImportedDay, type ImportedExercise } from './menuImport'
import { decodeText, formatDateSerial, xlsxToText } from './menuImportText'
import { toSavePayload, type CatalogExercise } from './templateEditor'

const bench: CatalogExercise = { exerciseMasterId: 'b1', trainerExerciseId: null, name: 'バーベルベンチプレス', targetMuscle: 'chest', requiresOneRm: true }
const fly: CatalogExercise = { exerciseMasterId: 'f1', trainerExerciseId: null, name: 'ペックフライ', targetMuscle: 'chest', requiresOneRm: false }
const own: CatalogExercise = { exerciseMasterId: null, trainerExerciseId: 'o1', name: 'ハイパーエクステンション', targetMuscle: 'back' }
const tread: CatalogExercise = { exerciseMasterId: null, trainerExerciseId: null, cardioMasterId: 'c1', name: 'トレッドミル', targetMuscle: 'cardio' }

const ex = (patch: Partial<ImportedExercise>): ImportedExercise => ({
  sourceName: 'ベンチプレス', matchKey: 'm:b1', matchGuessed: false, cardio: false, sets: [], minutes: null, km: null,
  note: null, guessed: [], unreadable: [], ...patch,
})

test('短い ID: 種目マスタ・有酸素・独自種目で別々に番号を振る', () => {
  const { list, keyOf } = shortIdsFor([own, bench, fly, tread])
  assert.deepEqual(list.map(e => e.shortId), ['t1', 'm1', 'm2', 'c1'])
  assert.equal(keyOf.get('m2'), 'm:f1')
  assert.equal(keyOf.get('c1'), 'c:c1')
})

test('Gemini の出力: ID を種目のキーに直し、おかしな値は捨て、同じ週・Day はつなげる', () => {
  const { keyOf } = shortIdsFor([bench])
  const out = normalizeGeminiOutput({
    days: [
      { w: 1, d: 1, label: '上半身', ex: [{ name: 'BP', id: 'm1', g: true, cardio: false, sets: [{ c: 3, kg: 60, pct: null, reps: 8, rir: 2, wu: false }], min: null, km: null, note: null, guess: [], bad: [] }] },
      { w: 1, d: 1, label: null, ex: [{ name: '謎の種目', id: 'm99', g: false, cardio: false, sets: [{ c: 0, kg: -5, pct: 500, reps: null, rir: 20, wu: false }], min: null, km: null, note: '', guess: [], bad: ['??'] }] },
      { w: 'x', d: 1, ex: [] },
    ],
    warnings: ['2週分のみ'],
  }, keyOf)
  assert.equal(out.days.length, 1)
  assert.equal(out.days[0].label, '上半身')
  assert.deepEqual(out.days[0].exercises.map(e => [e.sourceName, e.matchKey, e.matchGuessed]), [['BP', 'm:b1', true], ['謎の種目', null, false]])
  assert.deepEqual(out.days[0].exercises[1].sets[0], { count: 1, kg: null, pct: null, reps: null, rir: null, warmup: false })
  assert.deepEqual(out.days[0].exercises[1].unreadable, ['??'])
  assert.deepEqual(out.warnings, ['2週分のみ'])
})

test('表の種目名の一覧: 名前ごとにまとめ、選んだ種目は多い方。入らない週は数えない', () => {
  const days: ImportedDay[] = [
    { week: 1, day: 1, label: null, exercises: [ex({ sourceName: 'Back Squat', matchKey: 'm:s1', matchGuessed: true })] },
    { week: 2, day: 1, label: null, exercises: [ex({ sourceName: 'Back Squat', matchKey: null })] },
    { week: 3, day: 1, label: null, exercises: [ex({ sourceName: 'Back Squat', matchKey: null })] },
    { week: 17, day: 1, label: null, exercises: [ex({ sourceName: 'Back Squat', matchKey: 'm:s1' }), ex({ sourceName: '17週目だけ' })] },
  ]
  assert.deepEqual(sourceExercises(days), [{ sourceName: 'Back Squat', matchKey: null, matchGuessed: false, cardio: false, count: 3 }])
})

test('下書き: セットを数だけ並べ、%は1RM管理の種目だけ。有酸素は時間・距離。保存の形式に変換できる', () => {
  const days: ImportedDay[] = [
    { week: 1, day: 1, label: '上半身', exercises: [
      ex({ sets: [{ count: 1, kg: 40, pct: null, reps: 10, rir: null, warmup: true }, { count: 3, kg: null, pct: 75, reps: 6, rir: 1.5, warmup: false }] }),
      ex({ sourceName: 'ペックフライ', matchKey: 'm:f1', sets: [{ count: 2, kg: null, pct: 70, reps: 12, rir: null, warmup: false }], note: 'ラスト限界まで' }),
      ex({ sourceName: 'トレッドミル', matchKey: 'c:c1', cardio: true, minutes: 20, km: null, note: '傾斜5%' }),
      ex({ sourceName: '懸垂', matchKey: null, sets: [{ count: 3, kg: null, pct: null, reps: null, rir: null, warmup: false }] }),
    ] },
    { week: 2, day: 2, label: null, exercises: [ex({ sourceName: 'ハイパー', matchKey: null, sets: [{ count: 3, kg: null, pct: null, reps: 15, rir: null, warmup: false }], unreadable: ['MAX'] })] },
  ]
  const draft = buildDraft(days, { 'ベンチプレス': bench, 'ペックフライ': fly, 'トレッドミル': tread, '懸垂': 'skip', 'ハイパー': own })
  assert.equal(draft.totalWeeks, 2)
  assert.equal(draft.daysPerWeek, 2)
  // 2週 × 2日ぶんの Day を作る（表に無い Day は空）
  assert.deepEqual(draft.days.map(d => [d.weekNumber, d.dayNumber, d.exercises.length]), [[1, 1, 3], [1, 2, 0], [2, 1, 0], [2, 2, 1]])
  const [b, f, t] = draft.days[0].exercises
  assert.equal(draft.days[0].label, '上半身')
  assert.deepEqual(b.sets.map(s => [s.mode, s.value, s.reps, s.rir, s.isWarmup]), [
    ['kg', '40', '10', '', true], ['pct', '75', '6', '2', false], ['pct', '75', '6', '2', false], ['pct', '75', '6', '2', false],
  ])
  assert.deepEqual(f.sets.map(s => s.mode), ['auto', 'auto'])
  assert.equal(f.note, '70%\nラスト限界まで')
  assert.deepEqual([t.sets.length, t.targetMinutes, t.targetDistanceKm, t.note], [0, '20', '', '傾斜5%'])
  assert.equal(draft.days[3].exercises[0].trainerExerciseId, 'o1')
  assert.equal(draft.days[3].exercises[0].note, '表の記載: MAX')
  for (const d of draft.days) assert.equal(toSavePayload(d.exercises).ok, true)
})

test('下書き: 回数が読めなかったセットは空欄にし、保存の時に入力を求める', () => {
  const draft = buildDraft([{ week: 1, day: 1, label: null, exercises: [ex({ sets: [{ count: 1, kg: null, pct: null, reps: null, rir: null, warmup: false }] })] }], { 'ベンチプレス': bench })
  const payload = toSavePayload(draft.days[0].exercises)
  assert.equal(payload.ok, false)
})

test('ファイル → テキスト: サンプルの Excel（週ごとのシート・結合セル）', async () => {
  const dir = path.join(process.cwd(), 'docs/menu_import_samples')
  const file = fs.readdirSync(dir).find(n => n.startsWith('A_') && n.endsWith('.xlsx'))!
  const b = fs.readFileSync(path.join(dir, file))
  const text = await xlsxToText(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  const lines = text.split('\n')
  assert.equal(lines[0], '### シート: 1週目')
  assert.equal(lines[1], 'Day,種目,セット数,重量(kg),回数,備考')
  assert.equal(lines[2], 'Day1,ベンチプレス,4,75%,6,RIR2')
  // 結合セルは左上だけ
  assert.equal(lines[3], ',インクラインDBプレス,3,22,10')
  assert.equal(text.match(/### シート:/g)?.length, 4)
})

test('ファイル → テキスト: CSV は UTF-8 で読めなければ Shift_JIS', () => {
  assert.equal(decodeText(new TextEncoder().encode('﻿種目,回数').buffer as ArrayBuffer), '種目,回数')
  // 「あ,1」の Shift_JIS
  assert.equal(decodeText(new Uint8Array([0x82, 0xa0, 0x2c, 0x31]).buffer), 'あ,1')
})

test('シートごとに分ける: 見出しで分け、見出しが無ければ全体で1つ', () => {
  assert.deepEqual(splitSheets('### シート: WEEK01\na,b\n\n### シート: WEEK02\nc').map(s => [s.name, s.text]), [
    ['WEEK01', '### シート: WEEK01\na,b'], ['WEEK02', '### シート: WEEK02\nc'],
  ])
  assert.deepEqual(splitSheets('Day1\tベンチ').map(s => s.name), [null])
})

test('日付・時刻のセル: 画面の見え方どおり（「3-4」と入れたインターバルが日付になっていた表）', () => {
  assert.equal(formatDateSerial(43894, 'm-d'), '3-4')
  assert.equal(formatDateSerial(43894, 'yyyy/m/d'), '2020/3/4')
  assert.equal(formatDateSerial(43894, 'yyyy"年"m"月"d"日"'), '2020年3月4日')
  assert.equal(formatDateSerial(3 / 1440, 'm:ss'), '3:00')
  assert.equal(formatDateSerial(0.0625, 'h:mm'), '1:30')
})
