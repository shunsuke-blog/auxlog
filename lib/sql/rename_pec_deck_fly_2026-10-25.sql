-- 種目名「ペックデックフライ」を、馴染みのある「ペックフライ」に変える（2026-10-25 オーナー指示）。
-- 種目は exercise_master の id・code（pec_deck_fly）で参照しているため、記録・プラン・テンプレートは
-- そのまま新しい名前で表示される。code は変えない。
begin;
update public.exercise_master set name = 'ペックフライ' where code = 'pec_deck_fly' and name = 'ペックデックフライ';
commit;
