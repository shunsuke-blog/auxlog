-- Day画面から追加した種目を「その週だけ」にする（ステップ2／2、2026-10-19）
-- step1適用 → week_numberを書くAPIのデプロイ完了後に適用すること。

DELETE FROM public.user_program_day_extras WHERE week_number IS NULL;

ALTER TABLE public.user_program_day_extras ALTER COLUMN week_number SET NOT NULL;
