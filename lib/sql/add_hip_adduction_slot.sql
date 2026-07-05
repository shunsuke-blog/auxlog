-- ============================================================
-- 24番目のスロット hip_adduction（股関節内外転）を追加する
-- ============================================================
-- 部位×動きパターンベースのプログラム再設計に伴い、既存23スロットには
-- 股関節内外転パターンの担当が無かったため新規追加する。
-- 実行順序: add_movement_pattern_column.sql → このファイル

-- program_slots テーブルに24番目の行を追加
-- （day_number/priorityはDB上の初期値としてのみ残す。アプリのコードは
-- 　lib/constants/program_slots.ts の tier/body_region/movement_patternを正とし、
-- 　これらのDBカラムは参照しない）
INSERT INTO program_slots (program_id, slot_id, day_number, muscle_group, is_compound, has_one_rm, priority, sort_order)
SELECT
  '00000000-0000-0000-0001-000000000001',
  'hip_adduction',
  2,
  '脚（内外転）',
  false,
  false,
  1,
  (SELECT COALESCE(MAX(sort_order), 0) FROM program_slots WHERE program_id = '00000000-0000-0000-0001-000000000001') + 1
WHERE NOT EXISTS (
  SELECT 1 FROM program_slots
  WHERE program_id = '00000000-0000-0000-0001-000000000001' AND slot_id = 'hip_adduction'
);

-- program_weekly_params の初期値は、同じ脚のアイソレーション種目である calves_standing
-- （カーフ）のセット/レップ/RPE設定をコピーする（体幹のcore_altより筋特性が近いため）
INSERT INTO program_weekly_params (
  program_id, slot_id, week_number,
  top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe,
  backoff_sets, backoff_pct_rm, backoff_reps,
  working_sets, rep_range_min, rep_range_max, rpe,
  phase, is_excluded
)
SELECT
  program_id, 'hip_adduction', week_number,
  top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe,
  backoff_sets, backoff_pct_rm, backoff_reps,
  working_sets, rep_range_min, rep_range_max, rpe,
  phase, is_excluded
FROM program_weekly_params
WHERE program_id = '00000000-0000-0000-0001-000000000001' AND slot_id = 'calves_standing'
  AND NOT EXISTS (
    SELECT 1 FROM program_weekly_params
    WHERE program_id = '00000000-0000-0000-0001-000000000001' AND slot_id = 'hip_adduction'
  );

-- 既存の「ヒップアブダクション」「ヒップアダクション」種目を hip_adduction スロットに割り当てる
-- （現在 slot_type は未設定。movement_pattern は add_movement_pattern_column.sql で
-- 　既に hip_adduction_abduction にタグ付け済み）
UPDATE exercise_master
SET slot_type = 'hip_adduction'
WHERE name IN ('ヒップアブダクション', 'ヒップアダクション');

-- 確認: program_slots に24件登録されていること
SELECT COUNT(*) AS total_slots FROM program_slots WHERE program_id = '00000000-0000-0000-0001-000000000001';

-- 確認: hip_adduction の9週分パラメータ
SELECT slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase
FROM program_weekly_params
WHERE program_id = '00000000-0000-0000-0001-000000000001' AND slot_id = 'hip_adduction'
ORDER BY week_number;

-- 確認: ヒップアブダクション/ヒップアダクションのslot_type付け替え
SELECT name, slot_type, movement_pattern FROM exercise_master
WHERE name IN ('ヒップアブダクション', 'ヒップアダクション');
