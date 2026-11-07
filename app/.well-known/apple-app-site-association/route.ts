import { NextResponse } from 'next/server'

// iOS アプリの Universal Links（2026-11-07）。auxlog.app/join/<token>（ログイン用リンク）を、アプリが入っていればアプリで開く。
// 入っていなければ今までどおり Web の「ようこそ」の画面が開く。Team ID 578TVCZ9M7・バンドル ID com.auxlog.app
const APP_ID = '578TVCZ9M7.com.auxlog.app'

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [APP_ID],
            components: [{ '/': '/join/*' }],
            // iOS 12 以前の書き方（同じ意味）
            appID: APP_ID,
            paths: ['/join/*'],
          },
        ],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
