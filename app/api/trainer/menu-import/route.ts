import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, validationError } from '@/lib/api/errors'
import { trainerRpcError } from '@/lib/trainer/rpc'
import { MAX_IMPORT_CHARS, MAX_IMPORT_SHEETS, MAX_IMPORT_TOTAL_CHARS, splitSheets } from '@/lib/trainer/menuImport'
import { GeminiBusyError, readMenuWithGemini } from '@/lib/trainer/menuImportGemini'
import { loadTemplateCatalog } from '@/lib/trainer/templateCatalog'

// シートごとに同時に読むので、時間は一番大きいシート1枚（2万文字まで）で決まる。大きなシートは1〜2分かかる
export const maxDuration = 300

const ReadSchema = z.object({
  text: z.string().trim().min(1).max(MAX_IMPORT_TOTAL_CHARS)
    .refine(t => splitSheets(t).length <= MAX_IMPORT_SHEETS, 'シートが多すぎます')
    .refine(t => splitSheets(t).every(s => s.text.length <= MAX_IMPORT_CHARS), 'シートが大きすぎます'),
})

// メニューの表（ブラウザでテキストにしたもの）を Gemini で読み取る（2026-10-28）。DB には何も作らない。
// 回数は start_menu_import が数える（トレーナーごとに1日20回まで、失敗した回も数える）。
export async function POST(request: Request) {
  const supabase = await createClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ReadSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const { text } = parsed.data

  const { data: remaining, error: limitError } = await supabase.rpc('start_menu_import', { p_input_chars: text.length })
  if (limitError) return trainerRpcError(limitError, '読み取りを始められませんでした')

  const catalog = await loadTemplateCatalog(supabase, user.id)
  if (!catalog) return dbError('種目の一覧の取得に失敗しました')

  try {
    const result = await readMenuWithGemini(text, catalog)
    if (result.days.length === 0) {
      return NextResponse.json({ error: '表からメニューを読み取れませんでした。種目・セット・回数が書かれた表か確かめてください', remaining }, { status: 422 })
    }
    // 確認の画面で種目を選び直すのに使うので、一覧も返す
    return NextResponse.json({ ...result, remaining, catalog })
  } catch (e) {
    if (e instanceof GeminiBusyError) {
      return NextResponse.json({ error: 'AI の読み取りが混み合っています。少し時間をおいてもう一度お試しください', remaining }, { status: 503 })
    }
    console.error('[menu-import]', e)
    return NextResponse.json({ error: '表の読み取りに失敗しました。もう一度お試しください', remaining }, { status: 500 })
  }
}
