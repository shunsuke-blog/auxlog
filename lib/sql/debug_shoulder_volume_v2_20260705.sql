-- ============================================================
-- 肩ボリューム調査 v2（2026-07-05）
-- ============================================================
-- v1の反省: target_muscle='shoulders' を em.target_muscle と
-- ue.custom_target_muscle の OR で判定していたため、
-- custom_target_muscle が別の値で上書きされているケースを
-- 誤って「shoulders」に含めてしまっていた可能性がある。
-- アプリ本来の優先順位（custom_target_muscle があればそちらが
-- 優先、無ければ exercise_master.target_muscle）で effective_muscle
-- を計算し直す。

-- ① サイドレイズ・フェイスプル・OHP・ケーブルサイドレイズの
--    custom_target_muscle 上書き有無を直接確認
SELECT
  ue.id,
  ue.is_active,
  COALESCE(ue.custom_name, em.name) AS exercise_name,
  ue.custom_target_muscle,
  em.target_muscle AS master_target_muscle,
  COALESCE(ue.custom_target_muscle, em.target_muscle) AS effective_muscle
FROM user_exercises ue
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
WHERE COALESCE(ue.custom_name, em.name) IN ('サイドレイズ', 'フェイスプル', 'オーバーヘッドプレス', 'ケーブルサイドレイズ');

-- ② effective_muscle 基準で直近7日間の集計をやり直す（正しい版）
SELECT
  COALESCE(ue.custom_name, em.name) AS exercise_name,
  COALESCE(ue.custom_target_muscle, em.target_muscle) AS effective_muscle,
  ue.is_active,
  count(*) AS set_count
FROM training_sets ts
JOIN user_exercises ue ON ue.id = ts.exercise_id
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
JOIN training_sessions ts_sessions ON ts_sessions.id = ts.session_id
WHERE ts.is_warmup = false
  AND ts_sessions.trained_at >= (CURRENT_DATE - INTERVAL '7 days')
GROUP BY COALESCE(ue.custom_name, em.name), COALESCE(ue.custom_target_muscle, em.target_muscle), ue.is_active
ORDER BY effective_muscle, exercise_name;
