-- usersテーブルへのクライアントからの書き込みを禁止する（2026-10-19）
--
-- 背景: RLSポリシー「users can only access own data」(ALL, auth.uid() = id) と
-- authenticatedロールへの全カラムUPDATE権限の組み合わせにより、ログイン中のユーザーが
-- anonキー＋自分のJWTでSupabaseへ直接 UPDATE users SET is_admin = true 等を送れる状態だった
-- （is_admin / subscription_status / is_free / free_until を自分で書き換えてペイウォールを回避できる）。
--
-- クライアント（モバイル・Web）からのusers書き込みは存在しない。Stripe系API
-- （create/resume/reactivate/cancel-subscription, create-portal-session）は
-- createServiceClient() 経由の更新に切り替え済みで、それをデプロイしてから適用すること。
-- 行の作成はauth.usersのトリガー handle_new_user()（SECURITY DEFINER）が行うため影響なし。
-- SELECTは引き続きRLS（本人の行のみ）で許可する。

REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;

-- 確認: authenticatedに残る権限がSELECT（とREFERENCES等の読み取り系）だけであること
-- SELECT privilege_type FROM information_schema.table_privileges
-- WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'authenticated';
