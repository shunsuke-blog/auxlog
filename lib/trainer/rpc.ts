import { NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { dbError } from '@/lib/api/errors'

// トレーナー用RPCのエラーをHTTPレスポンスに変換する。RPC側は権限エラーを 42501、
// 入力値エラーを 22023 で投げる（lib/sql/plan_templates_2026-10-19.sql）。
export function trainerRpcError(error: PostgrestError, fallback: string) {
  if (error.code === '42501') return NextResponse.json({ error: '操作する権限がありません' }, { status: 403 })
  if (error.code === '22023') return NextResponse.json({ error: '入力値が正しくありません' }, { status: 400 })
  return dbError(fallback, error)
}
