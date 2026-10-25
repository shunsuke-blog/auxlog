-- トレーナーからのメモ（Auxlogで作成が書いたもの）の書き方を変える（2026-10-25 オーナー指定）。
--   修正前: 「9〜11回の範囲で、あと3〜4回はできる、くらいの重さで」（項目は「 ／ 」でつなぐ）
--   修正後: 「回数：9〜11回」「重量：あと3〜4回はできる、くらいの重さ」の2行（項目は改行でつなぐ）
-- 生成の側は lib/coaching/generate_template.ts（NOTE_SEPARATOR・effortText）。
-- 対象は生成した書き方のメモだけ（回数の範囲・ディロード週・MaxOut週）。トレーナーが自分で書いたメモは変えない。

begin;

update public.plan_exercises
set note = replace(
  regexp_replace(
    regexp_replace(note, '(\d+)〜(\d+)回の範囲で、([^／]*?)重さで', E'回数：\\1〜\\2回\n重量：\\3重さ', 'g'),
    '(\d+)〜(\d+)回の範囲で', E'回数：\\1〜\\2回', 'g'),
  ' ／ ', E'\n')
where note ~ '\d+〜\d+回の範囲で' or note like 'ディロード週 — %' or note like 'MaxOut週 — %';

commit;
