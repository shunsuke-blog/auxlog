-- プログラム構成の新方式（program_composition.ts）への移行SQL。
-- 設計根拠: .company/engineering/docs/program-composition-redesign-brainstorm.md
--
-- 方針（2026-07-08オーナー決定）:
-- 1. program_weekly_params（9週間の週次進行テンプレート）は個人データではなくプログラム設計
--    そのものなので、旧slot_idと役割が対応する新canonicalカテゴリへ数値を「引き継ぐ」
--    （INSERT...SELECTで丸ごとコピー、手打ちしない）。
-- 2. 旧システムに存在しなかった新カテゴリ（leg_default, triceps_2, back_3）だけ、
--    役割が最も近い旧スロットのデータを複製してベースラインとする（要チューニング）。
-- 3. user_slot_assignments・user_slot_one_rms は個人データ（選択済み種目・1RM履歴）のため
--    リセットする（オーナー本人のみが利用中のためコスト削減、brainstorm #17）。
--
-- 旧→新 対応表:
--   chest_press          <- chest_compound
--   shoulder_press        <- shoulder_vertical_press
--   back_row               <- back_horizontal_pull
--   back_pull               <- back_vertical_pull
--   leg_squat               <- quad_glute_primary
--   leg_hinge               <- hamstring_glute
--   core_1                   <- core
--   biceps_1                 <- biceps
--   triceps_1                 <- triceps
--   leg_default (新規相当)     <- quad_glute_secondary
--   shoulder_rear_delt        <- shoulder_rear_delt   (IDが同じためコピー不要)
--   shoulder_lateral           <- shoulder_lateral     (同上)
--   back_2                       <- back_horizontal_pull_heavy
--   chest_fly                     <- chest_isolation
--   leg_2                          <- quad_glute_secondary
--   biceps_2                        <- biceps_alt
--   triceps_2 (新規相当)              <- triceps（複製してベースラインに）
--   core_2                            <- core_alt
--   shoulder_press_2                   <- shoulder_vertical_press_alt
--   calves                               <- calves_seated
--   back_3 (新規相当)                     <- back_vertical_pull_alt
--   chest_3                                <- chest_isolation_alt
--   leg_3                                    <- hamstring_glute_heavy
--
-- 実行前提: 既存の program_based_logic_migration.sql 等が適用済みであること。

BEGIN;

-- ── 1. program_weekly_params: 旧slot_idのデータを新canonicalカテゴリへコピー ──
-- (shoulder_rear_delt, shoulder_lateralはIDが同じなのでコピー不要)

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'chest_press', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'chest_compound'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'shoulder_press', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'shoulder_vertical_press'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'back_row', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'back_horizontal_pull'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'back_pull', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'back_vertical_pull'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'leg_squat', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'quad_glute_primary'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'leg_hinge', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'hamstring_glute'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'core_1', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'core'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'biceps_1', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'biceps'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'triceps_1', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'triceps'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- leg_default（新規相当）: quad_glute_secondaryを流用
INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'leg_default', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'quad_glute_secondary'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'back_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'back_horizontal_pull_heavy'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'chest_fly', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'chest_isolation'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'leg_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'quad_glute_secondary'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'biceps_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'biceps_alt'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- triceps_2（新規相当）: 既存のtricepsデータを複製してベースラインに
INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'triceps_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'triceps'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'core_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'core_alt'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'shoulder_press_2', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'shoulder_vertical_press_alt'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'calves', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'calves_seated'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- back_3（新規相当）: back_vertical_pull_altを流用
INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'back_3', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'back_vertical_pull_alt'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'chest_3', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'chest_isolation_alt'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

INSERT INTO program_weekly_params (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
SELECT program_id, 'leg_3', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded
FROM program_weekly_params WHERE slot_id = 'hamstring_glute_heavy'
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- ── 2. program_slots: 新canonicalカテゴリのカタログ行を追加 ──
-- day_number/priority/sort_orderはアプリコード側では未使用（program_composition.tsが
-- source of truth）。NOT NULL制約を満たすためのプレースホルダーとして埋める。
INSERT INTO program_slots (program_id, slot_id, day_number, muscle_group, is_compound, has_one_rm, priority, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001','chest_press',1,'chest',true,true,1,1),
  ('00000000-0000-0000-0001-000000000001','shoulder_press',1,'shoulders',true,true,1,2),
  ('00000000-0000-0000-0001-000000000001','back_row',1,'back',true,false,1,3),
  ('00000000-0000-0000-0001-000000000001','back_pull',1,'back',true,false,1,4),
  ('00000000-0000-0000-0001-000000000001','leg_squat',1,'legs',true,true,1,5),
  ('00000000-0000-0000-0001-000000000001','leg_hinge',1,'legs',true,false,1,6),
  ('00000000-0000-0000-0001-000000000001','core_1',1,'core',false,false,1,7),
  ('00000000-0000-0000-0001-000000000001','biceps_1',1,'arms',false,false,1,8),
  ('00000000-0000-0000-0001-000000000001','triceps_1',1,'arms',false,false,1,9),
  ('00000000-0000-0000-0001-000000000001','leg_default',1,'legs',true,true,1,10),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',1,'shoulders',false,false,1,12),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',1,'shoulders',false,false,1,13),
  ('00000000-0000-0000-0001-000000000001','back_2',1,'back',false,false,1,14),
  ('00000000-0000-0000-0001-000000000001','chest_fly',1,'chest',false,false,1,15),
  ('00000000-0000-0000-0001-000000000001','leg_2',1,'legs',true,true,1,16),
  ('00000000-0000-0000-0001-000000000001','biceps_2',1,'arms',false,false,1,17),
  ('00000000-0000-0000-0001-000000000001','triceps_2',1,'arms',false,false,1,18),
  ('00000000-0000-0000-0001-000000000001','core_2',1,'core',false,false,1,19),
  ('00000000-0000-0000-0001-000000000001','shoulder_press_2',1,'shoulders',true,false,1,20),
  ('00000000-0000-0000-0001-000000000001','calves',1,'legs',false,false,1,21),
  ('00000000-0000-0000-0001-000000000001','back_3',1,'back',false,false,1,22),
  ('00000000-0000-0000-0001-000000000001','chest_3',1,'chest',false,false,1,23),
  ('00000000-0000-0000-0001-000000000001','leg_3',1,'legs',true,true,1,24)
ON CONFLICT (program_id, slot_id) DO NOTHING;

-- ── 3. 個人データのリセット（オーナー本人のみ利用中、brainstorm #17） ──
DELETE FROM user_slot_assignments;
DELETE FROM user_slot_one_rms;

COMMIT;
