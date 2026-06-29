-- ============================================================
-- ケーブルフライ 半角/全角括弧重複クリーンアップ
-- 半角 () → 全角 （） に統一し、重複 user_exercises を削除
-- ============================================================

-- ============================================================
-- 診断: 現状確認（実行前に確認推奨）
-- ============================================================

-- exercise_master のケーブルフライ一覧
SELECT id, name, target_muscle, slot_type
FROM exercise_master
WHERE name LIKE '%ケーブルフライ%'
ORDER BY name;

-- user_exercises の重複一覧
SELECT ue.user_id, em.name, count(*) as cnt
FROM user_exercises ue
JOIN exercise_master em ON em.id = ue.exercise_master_id
WHERE em.name LIKE '%ケーブルフライ%'
GROUP BY ue.user_id, em.name
ORDER BY em.name;


-- ============================================================
-- 1. ケーブルフライ(上部) → ケーブルフライ（上部）に統一
-- ============================================================

-- 1a: training_sets を移行（両方持つユーザー）
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（上部）')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(上部)');

-- 1b: user_slot_assignments を移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（上部）')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(上部)');

-- 1c: 半角のみ持つユーザーは exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（上部）')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(上部)')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（上部）')
  );

-- 1d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(上部)');

-- 1e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'ケーブルフライ(上部)';


-- ============================================================
-- 2. ケーブルフライ(中部) → ケーブルフライ（中部）に統一
-- ============================================================

-- 2a: training_sets を移行
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(中部)');

-- 2b: user_slot_assignments を移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(中部)');

-- 2c: 半角のみ持つユーザーは exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(中部)')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
  );

-- 2d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(中部)');

-- 2e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'ケーブルフライ(中部)';


-- ============================================================
-- 3. ケーブルフライ(下部) → ケーブルフライ（下部）に統一
-- ============================================================

-- 3a: training_sets を移行
UPDATE training_sets ts
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（下部）')
WHERE ts.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(下部)');

-- 3b: user_slot_assignments を移行
UPDATE user_slot_assignments usa
SET exercise_id = new_ue.id
FROM user_exercises old_ue
JOIN user_exercises new_ue
  ON old_ue.user_id = new_ue.user_id
 AND new_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（下部）')
WHERE usa.exercise_id = old_ue.id
  AND old_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(下部)');

-- 3c: 半角のみ持つユーザーは exercise_master_id を更新
UPDATE user_exercises ue
SET exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（下部）')
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(下部)')
  AND NOT EXISTS (
    SELECT 1 FROM user_exercises ue2
    WHERE ue2.user_id = ue.user_id
      AND ue2.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（下部）')
  );

-- 3d: 両方持っていた場合の旧 user_exercises を削除
DELETE FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ(下部)');

-- 3e: exercise_master から削除
DELETE FROM exercise_master WHERE name = 'ケーブルフライ(下部)';


-- ============================================================
-- 4. ケーブルフライ（中部） user_exercises 重複削除
--    同じユーザーが同じ exercise_master_id で複数 user_exercises を持つ場合
-- ============================================================

-- 重複している場合、古い方（id が小さい方）を残して新しい方を削除
-- まず training_sets を古い方に集約
UPDATE training_sets ts
SET exercise_id = keep_ue.id
FROM user_exercises keep_ue
JOIN user_exercises dup_ue
  ON keep_ue.user_id = dup_ue.user_id
 AND keep_ue.exercise_master_id = dup_ue.exercise_master_id
 AND keep_ue.id < dup_ue.id
WHERE ts.exercise_id = dup_ue.id
  AND keep_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）');

-- user_slot_assignments を古い方に集約
UPDATE user_slot_assignments usa
SET exercise_id = keep_ue.id
FROM user_exercises keep_ue
JOIN user_exercises dup_ue
  ON keep_ue.user_id = dup_ue.user_id
 AND keep_ue.exercise_master_id = dup_ue.exercise_master_id
 AND keep_ue.id < dup_ue.id
WHERE usa.exercise_id = dup_ue.id
  AND keep_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）');

-- 重複している新しい方を削除（id が大きい方）
DELETE FROM user_exercises dup_ue
WHERE dup_ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルフライ（中部）')
  AND EXISTS (
    SELECT 1 FROM user_exercises keep_ue
    WHERE keep_ue.user_id = dup_ue.user_id
      AND keep_ue.exercise_master_id = dup_ue.exercise_master_id
      AND keep_ue.id < dup_ue.id
  );


-- ============================================================
-- 確認クエリ
-- ============================================================

SELECT em.name, count(ue.id) as user_count
FROM exercise_master em
LEFT JOIN user_exercises ue ON ue.exercise_master_id = em.id
WHERE em.name LIKE '%ケーブルフライ%'
GROUP BY em.name
ORDER BY em.name;
