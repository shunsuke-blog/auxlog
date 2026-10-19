import { NextResponse, type NextRequest } from 'next/server'
import { SELF_VIEW_COOKIE } from '@/lib/trainer/session'

// 一覧の自分の行から「自分のトレーニング」に入る。Cookieを立ててトレーニー用のホームへ。
// 戻るときはトレーニー用の設定画面の「トレーナー画面に戻る」（/trainer/exit-self）。
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/', request.url), 303)
  res.cookies.set(SELF_VIEW_COOKIE, '1', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
