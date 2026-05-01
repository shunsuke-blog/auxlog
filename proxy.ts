import { NextResponse, type NextRequest } from 'next/server'

// Supabase のセッション Cookie 名（project ref から生成）
const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?.replace('https://', '')
  .split('.')[0] ?? ''

function hasSession(request: NextRequest): boolean {
  // Supabase は sb-{ref}-auth-token または sb-{ref}-auth-token.0 などに Cookie を保存する
  const cookieNames = request.cookies.getAll().map(c => c.name)
  return cookieNames.some(name => name.startsWith(`sb-${PROJECT_REF}-auth-token`))
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const loggedIn = hasSession(request)

  // 未認証ユーザーをログイン画面にリダイレクト
  if (
    !loggedIn &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/favicon')
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 認証済みユーザーがログイン画面にアクセスしたらホームにリダイレクト
  if (loggedIn && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
