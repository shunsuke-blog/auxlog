// クライアントのログイン用リンク（2026-10-28）。トレーナーがクライアントを追加すると出る https://auxlog.app/join/<token>。
// 1回だけ・14日間。DB は lib/sql/trainee_login_links_2026-10-28.sql

/** リンクの状態（peek_trainee_login_link の state） */
export type LoginLinkState = 'valid' | 'used' | 'revoked' | 'expired' | 'ended' | 'not_found'

export type LoginLinkPeek = {
  state: LoginLinkState
  link_id?: string
  link_status?: 'invited' | 'active' | 'paused' | 'ended'
  trainee_id?: string | null
  trainer_id?: string
  client_name?: string
  trainer_name?: string | null
  expires_at?: string
}

/** リンクの URL（origin は画面ならその場所、サーバーなら NEXT_PUBLIC_APP_URL） */
export const loginLinkUrl = (origin: string, token: string) => `${origin}/join/${token}`

/** LINE で送る文（招待文は「リンクを押すだけ」、2026-10-28 オーナー決定） */
export function loginLinkMessage(url: string, clientName: string, kind: 'invite' | 'relogin') {
  return kind === 'invite'
    ? `${clientName}さん\nトレーニングのメニューを Auxlog でお送りします。\n下のリンクを押すと、あなたのメニューが開きます（登録やパスワードは不要です）。\n${url}\n※リンクは1回だけ使えます`
    : `${clientName}さん\nAuxlog にログインするためのリンクです。\n下のリンクを押すと、あなたのメニューが開きます。\n${url}\n※リンクは1回だけ使えます`
}

/** LINE の「送る」画面を開く URL（スマホは LINE アプリ、PC は LINE のサイト） */
export const lineShareUrl = (text: string) => `https://line.me/R/share?text=${encodeURIComponent(text)}`

/** 日本時間の今日（YYYY-MM-DD）。プランを始める日に使う */
export function tokyoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
