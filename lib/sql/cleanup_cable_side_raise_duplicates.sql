-- ============================================================
-- ケーブルサイドレイズの重複 user_exercises 統合（2026-07-05）
-- ============================================================
-- 背景: shoulder_lateral_cable スロットの「ケーブルサイドレイズ」に
-- 対して、同一ユーザー・同一 exercise_master_id の user_exercises 行が
-- 4件重複して存在することが判明（is_active=true × 4）。
-- user_slot_assignments が参照している1件を正（canonical）とし、
-- 残り3件を training_sets ごと正に統合する。
-- 他の種目でも同様の重複が起きている可能性があるため、①の確認は
-- exercise_master_id を指定しない全体版も用意した。

-- ① 確認: 重複が起きている exercise_master_id を洗い出す（is_active問わず全件）
SELECT ue.exercise_master_id, em.name, count(*) AS dup_count,
       array_agg(ue.id) AS user_exercise_ids,
       array_agg(ue.is_active) AS is_active_flags
FROM user_exercises ue
LEFT JOIN exercise_master em ON em.id = ue.exercise_master_id
GROUP BY ue.exercise_master_id, em.name
HAVING count(*) > 1;

-- ①-b 特に重要: 今日ケーブルサイドレイズを実施した記録が、
-- is_active=false（無効化済み）の重複行に紐づいていないか確認。
-- ここに行が出てくる場合、履歴のボリューム集計クエリが is_active=true
-- のみを見るため、その記録は完全に集計から漏れる。
SELECT ts.id AS training_set_id, ts.exercise_id, ue.is_active, ts.created_at
FROM training_sets ts
JOIN user_exercises ue ON ue.id = ts.exercise_id
WHERE ue.exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルサイドレイズ')
  AND ue.is_active = false
ORDER BY ts.created_at DESC;

-- ② 統合本体（ケーブルサイドレイズのみ、他の重複が①で見つかった場合は都度対応）
-- slot_id は必要に応じて変更可能。exercise_master_id は自動解決する。
DO $$
DECLARE
  v_master_id uuid;
  v_canonical_id uuid;
  v_dup_ids uuid[];
BEGIN
  SELECT id INTO v_master_id
  FROM exercise_master WHERE name = 'ケーブルサイドレイズ';

  -- user_slot_assignments が指している行を正とする
  SELECT usa.exercise_id INTO v_canonical_id
  FROM user_slot_assignments usa
  JOIN user_exercises ue ON ue.id = usa.exercise_id
  WHERE usa.slot_id = 'shoulder_lateral_cable'
    AND ue.exercise_master_id = v_master_id
  LIMIT 1;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'canonical な user_exercises が見つかりませんでした。手動確認してください。';
  END IF;

  SELECT array_agg(id) INTO v_dup_ids
  FROM user_exercises
  WHERE exercise_master_id = v_master_id
    AND id <> v_canonical_id;

  IF v_dup_ids IS NULL THEN
    RAISE NOTICE '重複はありませんでした（canonical id: %）', v_canonical_id;
    RETURN;
  END IF;

  -- 重複行に記録された training_sets を正の行へ付け替え
  UPDATE training_sets
  SET exercise_id = v_canonical_id
  WHERE exercise_id = ANY(v_dup_ids);

  -- 重複していた user_slot_assignments があれば付け替え（通常は無いはず）
  UPDATE user_slot_assignments
  SET exercise_id = v_canonical_id
  WHERE exercise_id = ANY(v_dup_ids);

  -- 重複行を無効化（削除ではなく is_active=false。安全のため物理削除はしない）
  UPDATE user_exercises
  SET is_active = false
  WHERE id = ANY(v_dup_ids);

  RAISE NOTICE '統合完了: canonical=%, 無効化した重複id=%', v_canonical_id, v_dup_ids;
END $$;

-- ③ 確認: 統合後の状態
SELECT id, is_active, exercise_master_id
FROM user_exercises
WHERE exercise_master_id = (SELECT id FROM exercise_master WHERE name = 'ケーブルサイドレイズ');
