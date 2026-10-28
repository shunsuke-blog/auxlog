-- 種目マスタに 自重スクワット を追加する（2026-10-28 オーナー指示）。
-- メニューのインポートで、重量の無い「スクワット」を取り込む先（重量・%RM があればバーベルのスクワットとして扱う）。
-- 推奨度（tier）は同じ動きの補助種目（ランジ・ゴブレットスクワット）と同じ 3（オンボーディングの種目一覧には出さない）。

begin;

insert into public.exercise_master
  (name, code, target_muscle, movement_pattern, sort_order, is_bodyweight, is_compound, intensity_technique, tier, requires_one_rm)
values
  ('自重スクワット', 'bodyweight_squat', 'legs', 'squat', 4645, true, true, 'none', 3, false);

commit;
