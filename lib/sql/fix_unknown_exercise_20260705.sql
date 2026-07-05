-- ============================================================
-- 「不明な種目」の原因特定と修正（2026-07-05）
-- ============================================================
-- 履歴画面で7/4のケーブルサイドレイズが「不明な種目」と表示される
-- 不具合が発生。ケーブルサイドレイズの重複統合SQLが原因である
-- 可能性が高い（training_setsの付け替えが一部漏れていた等）。

-- ① 診断: is_active=true のユーザー種目に存在しないexercise_idを
--    参照している training_sets を洗い出す（＝「不明な種目」の実体）
SELECT ts.id AS training_set_id, ts.exercise_id, ts.session_id, sess.trained_at,
       ue.id AS matching_user_exercise_id, ue.is_active,
       COALESCE(ue.custom_name, em.name) AS name_if_found
FROM training_sets ts
JOIN training_sessions sess ON sess.id = ts.session_id
LEFT JOIN user_exercises ue ON ue.id = ts.exercise_id
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
WHERE ue.id IS NULL OR ue.is_active = false
ORDER BY sess.trained_at DESC;

-- ② 上記で出てきた exercise_id が、先ほど無効化した
--    ケーブルサイドレイズの重複行（is_active=false にした3件）と
--    一致するか確認
SELECT id, is_active, exercise_master_id
FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルサイドレイズ');

-- ③ 修正: is_active=false になっている行に、まだ training_sets が
--    残っている（付け替え漏れがあった）場合、正しい canonical 行へ
--    改めて付け替える
DO $$
DECLARE
  v_master_id uuid;
  v_canonical_id uuid;
  v_orphan_ids uuid[];
BEGIN
  SELECT id INTO v_master_id
  FROM exercise_master WHERE name = 'ケーブルサイドレイズ';

  SELECT usa.exercise_id INTO v_canonical_id
  FROM user_slot_assignments usa
  JOIN user_exercises ue ON ue.id = usa.exercise_id
  WHERE usa.slot_id = 'shoulder_lateral_cable'
    AND ue.exercise_master_id = v_master_id
  LIMIT 1;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'canonical id が見つかりません。手動確認してください。';
  END IF;

  SELECT array_agg(id) INTO v_orphan_ids
  FROM user_exercises
  WHERE exercise_master_id = v_master_id
    AND id <> v_canonical_id;

  IF v_orphan_ids IS NOT NULL THEN
    UPDATE training_sets
    SET exercise_id = v_canonical_id
    WHERE exercise_id = ANY(v_orphan_ids);

    RAISE NOTICE '再付け替え完了: canonical=%, 対象=%', v_canonical_id, v_orphan_ids;
  ELSE
    RAISE NOTICE '対象の重複行が見つかりませんでした。①の結果を確認してください。';
  END IF;
END $$;

-- ④ 確認: 「不明な種目」がまだ残っていないか再チェック
SELECT ts.id AS training_set_id, ts.exercise_id, sess.trained_at
FROM training_sets ts
JOIN training_sessions sess ON sess.id = ts.session_id
LEFT JOIN user_exercises ue ON ue.id = ts.exercise_id
WHERE ue.id IS NULL OR ue.is_active = false;
