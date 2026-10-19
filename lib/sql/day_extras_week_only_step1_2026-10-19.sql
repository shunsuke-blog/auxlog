-- Day画面から追加した種目を「その週だけ」にする（ステップ1／2、2026-10-19）
--
-- 背景: これまで user_program_day_extras は一度追加すると毎週表示され続けた。仕様変更で
-- Day画面からの追加はその週だけ有効にし、毎週続ける種目はプログラム画面のカスタムスロットに寄せる。
--
-- 手順:
--   1. このSQLで week_number 列を NULL 許容で追加する（既存APIは列を書かないので壊れない）
--   2. week_number を書き込む・今週分だけ返すAPI（app/api/program/day-extras/route.ts）をデプロイ
--   3. step2 のSQLで week_number が NULL の行（既存5行＋デプロイまでの間に追加された行）を削除し NOT NULL にする
-- 既存5行は削除する方針（ユーザー決定、2026-10-19）。

ALTER TABLE public.user_program_day_extras ADD COLUMN week_number int;
