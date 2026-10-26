// ログイン用のコードを送れなかった時の表示（2026-10-26）。Supabase は同じメールアドレスへの再送信を60秒あけないと
// 「For security purposes, you can only request this after 42 seconds.」（429）で断る。続けて押した人が
// 「メールアドレスが違うのか」と迷わないよう、待つ秒数を出す。1時間あたりの送信数の上限もここで案内する。
export function otpSendErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  const seconds = error.message?.match(/after (\d+) seconds?/)?.[1]
  if (seconds) return `コードは続けて送れません。${seconds}秒ほど待ってから、もう一度お試しください。`
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'コードの送信が続いたため、一時的に送れなくなっています。しばらく（1時間ほど）待ってから、もう一度お試しください。'
  }
  return 'コードを送信できませんでした。メールアドレスを確認して、しばらくしてからもう一度お試しください。'
}
