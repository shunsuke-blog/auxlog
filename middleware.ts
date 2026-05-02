import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // auxlog.comへのアクセスをauxlog.appにリダイレクト（LPが完成するまでの暫定対応）
  if (hostname === 'auxlog.com' || hostname === 'www.auxlog.com') {
    const url = request.nextUrl.clone()
    url.host = 'auxlog.app'
    return NextResponse.redirect(url, 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
