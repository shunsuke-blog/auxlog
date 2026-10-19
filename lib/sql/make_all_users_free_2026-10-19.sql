-- トレーニー課金の廃止に伴い、全ユーザーを無料扱いにする（2026-10-19）
--
-- 背景: トレーナー機能への移行でトレーニー課金（iOS: RevenueCat、Web: Stripe）を廃止する。
-- iOSアプリにはOTAが無く、ペイウォールを外した新ビルドに更新しないユーザーは旧ビルドを使い続ける。
-- 旧ビルドは users.is_free / free_until を直接読み、isFreeActive(is_free, free_until)
-- （is_free=true かつ free_until が未来 or NULL）ならペイウォールを出さない。
-- 全員を is_free=true にし、新規登録の初期値も true にすることで、旧ビルドでも
-- アップデート無しでペイウォールが出なくなる。Webの (app)/layout.tsx も同じ判定。
--
-- 適用時点で free_until は全員NULL。users の課金カラムは旧ビルドが使われなくなるまで削除しない
-- （要件定義「課金の移行計画」A-6）。

UPDATE public.users SET is_free = true WHERE is_free IS DISTINCT FROM true;

ALTER TABLE public.users ALTER COLUMN is_free SET DEFAULT true;
