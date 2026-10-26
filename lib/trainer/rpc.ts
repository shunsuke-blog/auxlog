import { NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { dbError } from '@/lib/api/errors'

// 業務ルールで拒否した場合（RPCが errcode P0001 + hint で投げる）の表示メッセージ
export const RULE_MESSAGES: Record<string, string> = {
  trainee_limit: '今のプランで招待できるクライアントの上限に達しています',
  invalid_code: '招待コードが正しくないか、有効期限が切れています',
  too_many_attempts: '招待コードの入力が続けて間違っています。15分ほど待ってから、もう一度入力してください',
  own_invite: '自分が発行した招待コードは入力できません',
  already_linked: 'すでに担当のトレーナーがいます。今の契約を終了してから入力してください',
  already_recorded: '記録済みの種目はスキップできません',
  final_week: 'プランは最終週です',
  not_final_week: 'プランの最終週が終わってから完了できます',
  business_required: 'チームを作るにはビジネスプランが必要です',
  already_in_team: 'すでにチームに参加しています（参加の申請中を含む）。今のチームを抜けてから操作してください',
  own_subscription: 'ご自身でプロ・ビジネスプランを契約中です。チームに参加するとチームのビジネスプランで使えるので、先に設定の「お支払いの管理」から解約してください',
  team_full: 'チームのトレーナー枠がいっぱいです。トレーナーを増やす場合はお問い合わせください（ご相談のうえ枠を追加できます）',
  owner_has_clients: 'ご自身が担当しているクライアントがいます。先に担当替えしてから変更してください',
  not_in_team: 'チームに参加していません',
  business_invite_invalid: 'このページは使えません（すでに使われたか、取り消されています）。お手数ですが運営までお問い合わせください',
  business_invite_expired: 'このページの有効期限が切れています。お手数ですが運営までお問い合わせください',
  business_invite_email: 'このページは別のメールアドレス宛てです。運営からご案内したメールアドレスでログインし直してください',
  over_limit: '今のプランの上限を超えているため、この操作はできません。契約を終了して上限内に戻すか、プロプランにしてください',
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
