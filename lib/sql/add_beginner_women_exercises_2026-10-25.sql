-- 初心者向け・女性向けテンプレートで使う種目を種目マスタに追加する（2026-10-25）。
-- テンプレートの指定のうち、マスタに近い種目があるものは既存の種目を使う
-- （machine_chest_press→チェストプレス、barbell_hip_thrust→ヒップスラスト、
--   dumbbell_bulgarian_split_squat→ブルガリアンスクワット、hip_abduction_machine→ヒップアブダクション）。
-- マスタに無い5種目だけを追加する。1RM管理かどうかはテンプレート側で指定するため、マスタは1RM管理なし。
-- プランクは時間で行う種目。記録画面は「重量×回数」なので、回数の欄に秒数を入れる（オーナー決定）。
-- 推奨度（tier）は 3（オンボーディングの種目一覧には出さない）。

begin;

insert into public.exercise_master
  (name, code, target_muscle, movement_pattern, sort_order, is_bodyweight, is_compound, intensity_technique, tier, requires_one_rm)
values
  ('アシストプルアップ', 'assisted_pull_up', 'back', 'vertical_pull', 2406, false, true, 'none', 3, false),
  ('ダンベルルーマニアンデッドリフト', 'dumbbell_romanian_deadlift', 'legs', 'hip_hinge', 4306, false, true, 'none', 3, false),
  ('ダンベルヒップスラスト', 'dumbbell_hip_thrust', 'legs', 'hip_hinge', 4311, false, true, 'none', 3, false),
  ('ゴブレットスクワット', 'goblet_squat', 'legs', 'squat', 4640, false, true, 'none', 3, false),
  ('プランク（秒）', 'plank', 'core', 'trunk_flexion', 6135, true, false, 'none', 3, false);

commit;
