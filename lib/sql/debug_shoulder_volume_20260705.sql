-- ============================================================
-- 肩ボリュームが統合後にさらに減った件の直接調査（2026-07-05）
-- ============================================================
-- 直近7日間で target_muscle='shoulders' の training_sets を
-- exercise_id ごとに集計し、実際に何がどうカウントされているか
-- そのまま見る。憶測をやめて実データを確認する。

SELECT
  ue.id AS user_exercise_id,
  ue.is_active,
  COALESCE(ue.custom_name, em.name) AS exercise_name,
  em.target_muscle,
  ts.is_warmup,
  count(*) AS set_count,
  min(ts_sessions.trained_at) AS earliest,
  max(ts_sessions.trained_at) AS latest
FROM training_sets ts
JOIN user_exercises ue ON ue.id = ts.exercise_id
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
JOIN training_sessions ts_sessions ON ts_sessions.id = ts.session_id
WHERE (em.target_muscle = 'shoulders' OR ue.custom_target_muscle = 'shoulders')
  AND ts_sessions.trained_at >= (CURRENT_DATE - INTERVAL '7 days')
GROUP BY ue.id, ue.is_active, COALESCE(ue.custom_name, em.name), em.target_muscle, ts.is_warmup
ORDER BY exercise_name, ue.is_active DESC;
