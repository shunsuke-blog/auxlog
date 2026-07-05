-- ============================================================
-- 「ケーブルフライ」（角度指定なし）をexercise_masterに新規追加
-- ============================================================
-- 背景: オンボーディングのデフォルトを「ケーブルフライ（中部）」から
-- 角度指定のない「ケーブルフライ」に変更する。既存の（上部）/（中部）/
-- （下部）とは別の行として追加し、混同しないようにする。

INSERT INTO exercise_master (name, target_muscle, slot_type, is_compound, is_bodyweight, sort_order)
VALUES ('ケーブルフライ', 'chest', 'chest_isolation', false, false, 60);

-- 確認
SELECT id, name, slot_type, target_muscle, sort_order
FROM exercise_master
WHERE slot_type = 'chest_isolation'
ORDER BY sort_order;
