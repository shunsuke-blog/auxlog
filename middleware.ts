import { NextResponse, type NextRequest } from 'next/server'

const APP_STORE_URL = 'https://apps.apple.com/jp/app/auxlog/id6790152534'
const PREVIEW_COOKIE = 'auxlog_web_preview'

const ANDROID_COMING_SOON_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Auxlog</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#000;color:#fff;">
<div>
<h1 style="font-size:1.25rem;">Android版は準備中です</h1>
<p style="color:#999;">公開までしばらくお待ちください。</p>
</div>
</body>
</html>`

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // auxlog.comへのアクセスをauxlog.appにリダイレクト（LPが完成するまでの暫定対応）
  if (hostname === 'auxlog.com' || hostname === 'www.auxlog.com') {
    const url = request.nextUrl.clone()
    url.host = 'auxlog.app'
    return NextResponse.redirect(url, 308)
  }

  // Web版の公開再開前の動作確認用（2026-10-19）。WEB_PREVIEW_TOKEN が設定されている場合だけ、
  // ?preview=<token> を一度開いたブラウザに Cookie を保存し、以降は下の転送を通さない。
  // 環境変数が未設定なら何もしない（従来どおり全ページを転送する）。公開を再開したら削除する。
  const previewToken = process.env.WEB_PREVIEW_TOKEN
  if (previewToken) {
    if (request.nextUrl.searchParams.get('preview') === previewToken) {
      const url = request.nextUrl.clone()
      url.searchParams.delete('preview')
      const res = NextResponse.redirect(url, 307)
      res.cookies.set(PREVIEW_COOKIE, previewToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      })
      return res
    }
    if (request.cookies.get(PREVIEW_COOKIE)?.value === previewToken) {
      return NextResponse.next()
    }
  }

  // Web版は今後ユーザーに使わせない方針（2026-08-09）。/api配下はモバイルアプリが
  // 叩くバックエンドなので絶対にリダイレクトしない。それ以外の全ページアクセス
  // （ログイン・オンボーディング・ホーム等）は誘導する。AndroidはGoogle Play未公開
  // （2026-08-09時点、対応保留中）のためApp Storeへは飛ばさず案内ページを直接返す。
  if (!request.nextUrl.pathname.startsWith('/api')) {
    const userAgent = request.headers.get('user-agent') ?? ''
    if (/Android/i.test(userAgent)) {
      return new NextResponse(ANDROID_COMING_SOON_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    return NextResponse.redirect(APP_STORE_URL, 307)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
