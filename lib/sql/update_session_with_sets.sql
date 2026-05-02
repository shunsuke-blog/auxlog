-- セッションとセットをアトミックに更新するRPC関数
-- Supabase SQL Editor で実行してください
CREATE OR REPLACE FUNCTION update_session_with_sets(
  p_session_id UUID,
  p_user_id UUID,
  p_trained_at DATE,
  p_fatigue_level INTEGER,
  p_memo TEXT,
  p_sets JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 所有権確認（RLSのバックアップ）
  IF NOT EXISTS (
    SELECT 1 FROM training_sessions WHERE id = p_session_id AND user_id = p_user_id
  ) THEN RETURN FALSE; END IF;

  UPDATE training_sessions
  SET trained_at = p_trained_at, fatigue_level = p_fatigue_level, memo = p_memo
  WHERE id = p_session_id AND user_id = p_user_id;

  DELETE FROM training_sets WHERE session_id = p_session_id;

  INSERT INTO training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup)
  SELECT
    p_session_id,
    (s->>'exercise_id')::UUID,
    (s->>'set_number')::INTEGER,
    (s->>'weight_kg')::DECIMAL,
    (s->>'reps')::INTEGER,
    (s->>'rir')::BOOLEAN,
    COALESCE((s->>'is_warmup')::BOOLEAN, FALSE)
  FROM jsonb_array_elements(p_sets) s;

  RETURN TRUE;
END; $$;
