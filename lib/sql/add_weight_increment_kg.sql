-- user_exercises に weight_increment_kg カラムを追加
-- デフォルト値: NULL（正規化時に is_compound で自動決定）
ALTER TABLE user_exercises
  ADD COLUMN IF NOT EXISTS weight_increment_kg DECIMAL(4,1) DEFAULT NULL;

-- 既存レコードへのデフォルト値適用（is_compound=true → 5.0kg、false → 2.0kg）
UPDATE user_exercises ue
SET weight_increment_kg = CASE
  WHEN ue.is_compound = true THEN 5.0
  WHEN em.is_compound = true THEN 5.0
  ELSE 2.0
END
FROM exercise_master em
WHERE ue.exercise_master_id = em.id
  AND ue.weight_increment_kg IS NULL;

-- マスタ種目が紐づかないカスタム種目のフォールバック
UPDATE user_exercises
SET weight_increment_kg = CASE
  WHEN is_compound = true THEN 5.0
  ELSE 2.0
END
WHERE weight_increment_kg IS NULL;
