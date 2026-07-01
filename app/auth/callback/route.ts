import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Vercel 本番環境では x-forwarded-host が実際のドメイン
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocal = process.env.NODE_ENV === 'development'
  const redirectBase = isLocal
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin

  if (code) {
    // レスポンスを先に作り、Cookieをこのオブジェクトに直接セットする
    const successResponse = NextResponse.redirect(`${redirectBase}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              successResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return successResponse
    }
  }

  return NextResponse.redirect(`${redirectBase}/login?error=auth`)
}
