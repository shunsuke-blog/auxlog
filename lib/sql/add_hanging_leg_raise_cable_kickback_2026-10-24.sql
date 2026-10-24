-- 種目マスタに ハンギングレッグレイズ・ケーブルキックバック を追加する（2026-10-24 オーナー指示）。
-- - ハンギングレッグレイズ: 週7日 Day7 と体幹の差し替えで、ハンギングニーレイズの代わりに使う。
--   ハンギングニーレイズは既に自分の種目として使っている人がいるため、名前を書き換えずに残す。
-- - ケーブルキックバック: 種目として選べるようにするだけ。プログラムに組み込むのは
--   ケーブルトライセプスエクステンションのまま（オーナー指示）。
-- 推奨度（tier）は同じ動きの他の種目と同じ 3（オンボーディングの種目一覧には出さない）。

begin;

insert into public.exercise_master
  (name, code, target_muscle, movement_pattern, sort_order, is_bodyweight, is_compound, intensity_technique, tier, requires_one_rm)
values
  ('ハンギングレッグレイズ', 'hanging_leg_raise', 'core', 'trunk_flexion', 6130, true, false, 'none', 3, false),
  ('ケーブルキックバック', 'cable_kickback', 'arms', 'elbow_extension', 5140, false, false, 'none', 3, false);

commit;
