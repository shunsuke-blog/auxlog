import { NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { dbError } from '@/lib/api/errors'

// 業務ルールで拒否した場合（RPCが errcode P0001 + hint で投げる）の表示メッセージ
const RULE_MESSAGES: Record<string, string> = {
  trainee_limit: '無料プランで招待できるトレーニーは3人までです',
  invalid_code: '招待コードが正しくないか、有効期限が切れています',
  own_invite: '自分が発行した招待コードは入力できません',
  already_linked: 'すでに担当のトレーナーがいます。今の契約を終了してから入力してください',
}

// トレーナー用RPCのエラーをHTTPレスポンスに変換する。RPC側は権限エラーを 42501、
// 入力値エラーを 22023、業務ルールでの拒否を P0001（hint に理由）で投げる。
export function trainerRpcError(error: PostgrestError, fallback: string) {
  if (error.code === '42501') return NextResponse.json({ error: '操作する権限がありません' }, { status: 403 })
  if (error.code === '22023') return NextResponse.json({ error: '入力値が正しくありません' }, { status: 400 })
  if (error.code === 'P0001' && error.hint && RULE_MESSAGES[error.hint]) {
    return NextResponse.json({ error: RULE_MESSAGES[error.hint], reason: error.hint }, { status: 409 })
  }
  return dbError(fallback, error)
}
