-- ============================================================
-- exercise_master 重複整理
-- 実行前に必ずバックアップを確認すること
-- ============================================================

-- ============================================================
-- 1. チンアップ（懸垂）→ 懸垂 に統一
-- ============================================================

-- user_exercises の exercise_master_id を更新
-- （同ユーザーがすでに懸垂を持っている場合はスキップ）
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'チンアップ（懸垂）')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = '懸垂')
  );

-- exercise_master から削除
DELETE FROM exercise_master WHERE name = 'チンアップ（懸垂）';

-- 懸垂の slot_type を back_vertical_pull に変更（Day1 スロットを担当）
-- ※ Day3 (back_vertical_pull_alt) は懸垂を選択するか、ラットプルダウンで代替
UPDATE exercise_master
SET slot_type = 'back_vertical_pull'
WHERE name = '懸垂';


-- ============================================================
-- 2. ケーブルプレスダウン → トライセプスプレスダウン に統一
-- ============================================================

UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルプレスダウン')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'トライセプスプレスダウン')
  );

DELETE FROM exercise_master WHERE name = 'ケーブルプレスダウン';


-- ============================================================
-- 3. 汎用「ケーブルフライ」を削除
--    ユーザーデータは「ケーブルフライ（中部）」に移行
-- ============================================================

UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
  );

DELETE FROM exercise_master WHERE name = 'ケーブルフライ';


-- ============================================================
-- 確認クエリ（整理後の全種目一覧）
-- ============================================================

SELECT
  target_muscle,
  slot_type,
  name,
  is_bodyweight,
  is_compound
FROM exercise_master
ORDER BY target_muscle, COALESCE(slot_type, 'zzz'), sort_order;
