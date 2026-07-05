-- ============================================================
-- 7/4に「不明な種目」として表示されているケーブルサイドレイズの特定
-- ============================================================
-- 重量6.25kg × 12回 × 3セット（限界）というデータから、これは
-- ケーブルサイドレイズだと断定できる。このtraining_setsが実際に
-- どのexercise_idを参照しているか、is_activeかどうかを直接特定する。

SELECT
  ts.id AS training_set_id,
  ts.exercise_id,
  ts.weight_kg,
  ts.reps,
  ts.rir,
  sess.trained_at,
  ue.id AS ue_id,
  ue.is_active,
  ue.exercise_master_id,
  em.name AS master_name
FROM training_sets ts
JOIN training_sessions sess ON sess.id = ts.session_id
LEFT JOIN user_exercises ue ON ue.id = ts.exercise_id
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
WHERE ts.weight_kg = 6.25
  AND ts.reps = 12
  AND sess.trained_at = '2026-07-04'
ORDER BY ts.created_at;
