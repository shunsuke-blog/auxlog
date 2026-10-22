import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Web版はトレーナー機能に向けて2026-10-19に公開を再開した（2026-08-09〜はApp Storeへ転送していた）。
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // auxlog.comへのアクセスをauxlog.appにリダイレクト（LPが完成するまでの暫定対応）
  if (hostname === 'auxlog.com' || hostname === 'www.auxlog.com') {
    const url = request.nextUrl.clone()
    url.host = 'auxlog.app'
    return NextResponse.redirect(url, 308)
  }

  // ログインの維持（2026-10-22）: アクセストークン（1時間）の期限が切れていたら、ここで更新して
  // 新しいCookieを返す。Server Component はCookieを書き換えられないため、ここで更新しないと
  // 1時間以上たってから開いた時に、使用済みのリフレッシュトークンで更新を繰り返してログインが切れる。
  // ログイン用のCookieが無いリクエスト（未ログイン・モバイルアプリのBearer認証のAPI）は何もしない。
  if (!request.cookies.getAll().some(c => c.name.startsWith('sb-'))) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  // 期限切れならトークンを更新する（更新後のCookieは setAll で response に載る）
  await supabase.auth.getClaims()
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
}
