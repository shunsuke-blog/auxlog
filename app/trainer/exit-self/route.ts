import { NextResponse, type NextRequest } from 'next/server'
import { SELF_VIEW_COOKIE } from '@/lib/trainer/session'

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/trainer', request.url), 303)
  res.cookies.delete(SELF_VIEW_COOKIE)
  return res
}
