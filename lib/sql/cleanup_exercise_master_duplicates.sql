-- ============================================================
-- exercise_master 重複整理（完全版）
-- ユーザーが旧・新両方を持っている場合も安全に処理する
-- ============================================================

-- ============================================================
-- 1. チンアップ（懸垂）→ 懸垂 に統一
-- ============================================================

-- Step 1a: training_sets を新 user_exercise へ移行（ユーザーが両方持つ場合）
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'チンアップ（懸垂）');

-- Step 1b: user_slot_assignments を新 user_exercise へ移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'チンアップ（懸垂）');

-- Step 1c: 旧種目を持つユーザーが新種目を持たない場合は exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'チンアップ（懸垂）')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
  );

-- Step 1d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'チンアップ（懸垂）');

-- Step 1e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'チンアップ（懸垂）';

-- Step 1f: 懸垂の slot_type を back_vertical_pull に設定
UPDATE exercise_master
SET slot_type = 'back_vertical_pull'
WHERE name = '懸垂';


-- ============================================================
-- 2. ケーブルプレスダウン → トライセプスプレスダウン に統一
-- ============================================================

-- Step 2a: training_sets を移行
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルプレスダウン');

-- Step 2b: user_slot_assignments を移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルプレスダウン');

-- Step 2c: 旧種目のみ持つユーザーは exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルプレスダウン')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
  );

-- Step 2d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルプレスダウン');

-- Step 2e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'ケーブルプレスダウン';


-- ============================================================
-- 3. 汎用「ケーブルフライ」→ ケーブルフライ（中部）に移行して削除
-- ============================================================

-- Step 3a: training_sets を移行
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ');

-- Step 3b: user_slot_assignments を移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ');

-- Step 3c: 旧種目のみ持つユーザーは exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
  );

-- Step 3d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ');

-- Step 3e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'ケーブルフライ';


-- ============================================================
-- 確認クエリ
-- ============================================================

SELECT
  target_muscle,
  slot_type,
  name,
  is_bodyweight,
  is_compound
FROM exercise_master
ORDER BY target_muscle, COALESCE(slot_type, 'zzz'), sort_order;
