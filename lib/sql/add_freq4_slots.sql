-- ============================================================
-- 週4日専用の追加スロット5件を登録する
-- ============================================================
-- 「オンボーディングで選択した内容(日数と時間)によって数を変えるだけだ」の解釈訂正
-- （§0・§4-A）に伴う移行。週2・3日には一切影響しない。既存のslot_type未設定の
-- 一般カタログ種目を活用し、Upper/Lower分割（週4日）専用の追加バリエーションとする。
--
-- 実行順序: add_movement_pattern_column.sql → add_hip_adduction_slot.sql
--          → add_movement_pattern_out_of_scope_values.sql → このファイル
--
-- 新規5スロット:
--   shoulder_vertical_press_alt (肩・垂直プレス) ← アーノルドプレス
--   shoulder_rear_delt_alt (肩後部・肩水平外転) ← リアデルトフライ
--   chest_isolation_alt (胸補助・肩水平内転) ← ダンベルフライ
--   hip_abduction (脚外転・股関節内外転) ← ヒップアブダクション（既存hip_adductionから分離）
--   hamstring_glute_alt (脚裏側・ヒップヒンジ) ← デッドリフト（スモウ）

-- program_slots に5行追加（sort_orderは既存最大値の続きから。day_number/priorityは
-- DB上の初期値としてのみ残し、アプリのコードはprogram_slots.tsのfreq4Tier/freq4Onlyを正とする）
INSERT INTO program_slots (program_id, slot_id, day_number, muscle_group, is_compound, has_one_rm, priority, sort_order)
SELECT * FROM (VALUES
  ('00000000-0000-0000-0001-000000000001'::uuid, 'shoulder_vertical_press_alt', 3, '肩', false, false, 1, 9),
  ('00000000-0000-0000-0001-000000000001'::uuid, 'shoulder_rear_delt_alt', 3, '肩（後部）', false, false, 1, 10),
  ('00000000-0000-0000-0001-000000000001'::uuid, 'chest_isolation_alt', 3, '胸（補助）', false, false, 1, 11),
  ('00000000-0000-0000-0001-000000000001'::uuid, 'hip_abduction', 2, '脚（外転）', false, false, 1, 12),
  ('00000000-0000-0000-0001-000000000001'::uuid, 'hamstring_glute_alt', 4, '脚（裏側）', false, false, 1, 13)
) AS v(program_id, slot_id, day_number, muscle_group, is_compound, has_one_rm, priority, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM program_slots WHERE program_id = v.program_id AND slot_id = v.slot_id
);

-- program_weekly_params は同じ動きパターンの既存スロットから9週分コピーする
INSERT INTO program_weekly_params (
  program_id, slot_id, week_number,
  top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe,
  backoff_sets, backoff_pct_rm, backoff_reps,
  working_sets, rep_range_min, rep_range_max, rpe,
  phase, is_excluded
)
SELECT program_id, new_slot_id, week_number,
  top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe,
  backoff_sets, backoff_pct_rm, backoff_reps,
  working_sets, rep_range_min, rep_range_max, rpe,
  phase, is_excluded
FROM program_weekly_params, (VALUES
  ('back_horizontal_pull_heavy', 'shoulder_vertical_press_alt'),
  ('shoulder_rear_delt', 'shoulder_rear_delt_alt'),
  ('chest_isolation', 'chest_isolation_alt'),
  ('hip_adduction', 'hip_abduction'),
  ('hamstring_glute', 'hamstring_glute_alt')
) AS mapping(source_slot_id, new_slot_id)
WHERE program_weekly_params.slot_id = mapping.source_slot_id
  AND program_weekly_params.program_id = '00000000-0000-0000-0001-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM program_weekly_params p2
    WHERE p2.program_id = '00000000-0000-0000-0001-000000000001' AND p2.slot_id = mapping.new_slot_id
  );

-- exercise_master.slot_type を付け替え
UPDATE exercise_master SET slot_type = 'shoulder_vertical_press_alt' WHERE name = 'アーノルドプレス';
UPDATE exercise_master SET slot_type = 'shoulder_rear_delt_alt' WHERE name = 'リアデルトフライ';
UPDATE exercise_master SET slot_type = 'chest_isolation_alt' WHERE name = 'ダンベルフライ';
UPDATE exercise_master SET slot_type = 'hamstring_glute_alt' WHERE name = 'デッドリフト（スモウ）';

-- ヒップアブダクションを既存hip_adductionスロットから分離し、新設のhip_abductionへ付け替える
-- （ヒップアダクションはhip_adductionのまま据え置く）
UPDATE exercise_master SET slot_type = 'hip_abduction' WHERE name = 'ヒップアブダクション';

-- 確認: program_slotsに29件（既存24+新規5）登録されていること
SELECT COUNT(*) AS total_slots FROM program_slots WHERE program_id = '00000000-0000-0000-0001-000000000001';

-- 確認: 新規5スロットの週次パラメータが9週分ずつ入っていること
SELECT slot_id, COUNT(*) AS week_count
FROM program_weekly_params
WHERE program_id = '00000000-0000-0000-0001-000000000001'
  AND slot_id IN ('shoulder_vertical_press_alt', 'shoulder_rear_delt_alt', 'chest_isolation_alt', 'hip_abduction', 'hamstring_glute_alt')
GROUP BY slot_id;

-- 確認: exercise_masterのslot_type付け替え結果
SELECT name, slot_type FROM exercise_master
WHERE name IN ('アーノルドプレス', 'リアデルトフライ', 'ダンベルフライ', 'デッドリフト（スモウ）', 'ヒップアブダクション', 'ヒップアダクション');
