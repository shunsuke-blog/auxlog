-- ============================================================
-- サイドレイズの training_sessions 生データ確認（2026-07-05）
-- ============================================================
-- exercise_id・target_muscle・重複、すべて問題なしと確認済み。
-- 残る可能性は training_sessions 側のデータ形式（型・日付の
-- 境界値など）。session_id を経由して直接見る。

SELECT
  sess.id AS session_id,
  sess.trained_at,
  sess.user_id,
  ts.id AS training_set_id,
  ts.exercise_id,
  ts.is_warmup,
  ts.created_at AS set_created_at
FROM training_sets ts
JOIN training_sessions sess ON sess.id = ts.session_id
WHERE ts.exercise_id = '119772ec-d776-4633-81d9-1953f6ef5463'
ORDER BY ts.created_at;

-- 同じ日（2026-07-03）に何件の training_sessions が存在するか
-- （1日に複数セッションに分かれていないか）
SELECT id, trained_at, user_id, fatigue_level, created_at
FROM training_sessions
WHERE trained_at = '2026-07-03';
