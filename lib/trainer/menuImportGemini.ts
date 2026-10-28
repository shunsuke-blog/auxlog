// メニューのインポートで Gemini に表を読ませる（サーバー専用、2026-10-28）。
// キーは GEMINI_API_KEY（Google Cloud プロジェクト auxlog の有料の枠。送った内容は Google の改善に使われない）。
// SDK は使わず REST で呼ぶ。モデル・設定は試作で決めた（docs/menu_import_samples/prototype_gemini.mjs）:
// gemini-3.8-flash・thinkingLevel low で、サンプル3つ×3回すべて正確、1表 20〜37秒。
// 実際のトレーナーの表（9週×週4日、週ごとのシート）は1シート約25秒だったので、シートごとに同時に読む

import { GEMINI_RESPONSE_SCHEMA, buildInstruction, normalizeGeminiOutput, shortIdsFor, splitSheets, type MenuImportResult } from './menuImport'
import type { CatalogExercise } from './templateEditor'

const MODEL = 'gemini-3.8-flash'

export class GeminiBusyError extends Error {}

/** 表を読み取る。シートが複数ある時はシートごとに同時に読んでつなげる（時間は一番大きいシート1枚分で済む） */
export async function readMenuWithGemini(text: string, catalog: CatalogExercise[]): Promise<Omit<MenuImportResult, 'remaining'>> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY が設定されていません')
  const { list, keyOf } = shortIdsFor(catalog)
  const sheets = splitSheets(text)
  const all = sheets.map(s => s.name ?? '')
  const outputs = await Promise.all(sheets.map(s => {
    const instruction = buildInstruction(list, sheets.length > 1 && s.name ? { name: s.name, all } : undefined)
    // 出力が壊れた時（まれに JSON が途中で切れる）は1回だけ読み直す。混雑はそのまま返す
    return callGemini(key, instruction, s.text)
      .catch(e => { if (e instanceof GeminiBusyError) throw e; return callGemini(key, instruction, s.text) })
  }))
  // つなげる: 同じ週・Day が複数のシートから出たら normalizeGeminiOutput が1日にまとめる
  return normalizeGeminiOutput({
    days: outputs.flatMap(o => (Array.isArray((o as { days?: unknown }).days) ? (o as { days: unknown[] }).days : [])),
    warnings: outputs.flatMap(o => (Array.isArray((o as { warnings?: unknown }).warnings) ? (o as { warnings: unknown[] }).warnings : [])),
  }, keyOf)
}

async function callGemini(key: string, instruction: string, text: string): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  })
  // 混雑（503）・回数の制限（429）は「しばらくしてから」と案内する
  if (res.status === 503 || res.status === 429) throw new GeminiBusyError(`Gemini ${res.status}`)
  const body = await res.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] } | null
  if (!res.ok || !body) throw new Error(`Gemini ${res.status}: ${JSON.stringify(body).slice(0, 500)}`)

  const candidate = body.candidates?.[0]
  const out = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  try {
    return JSON.parse(out)
  } catch {
    throw new Error(`Gemini の出力を読めませんでした（${candidate?.finishReason ?? '理由不明'}、${out.length}文字）`)
  }
}
