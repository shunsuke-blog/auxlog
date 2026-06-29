-- 特定ユーザーのオンボーディング（enrollment）をリセットする
-- 実行後、そのユーザーはオンボーディングを最初からやり直せる
--
-- 使い方: EMAIL を対象のメールアドレスに変更して Supabase Dashboard > SQL Editor で実行

DO $$
DECLARE
  v_email   TEXT := 'calcul.support@gmail.com';  -- ← 対象ユーザーのメールアドレス
  v_user_id UUID;
  v_count   INTEGER;
BEGIN
  -- auth.users からユーザーID取得
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'ユーザーが見つかりません: %', v_email;
    RETURN;
  END IF;

  RAISE NOTICE 'ユーザーID: %', v_user_id;

  -- slot_assignments を削除（ON DELETE CASCADE があるが明示的に削除）
  DELETE FROM user_slot_assignments WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'user_slot_assignments 削除: % 件', v_count;

  -- enrollments を削除
  DELETE FROM user_program_enrollments WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'user_program_enrollments 削除: % 件', v_count;

  -- 1RM データを削除
  DELETE FROM user_slot_one_rms WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'user_slot_one_rms 削除: % 件', v_count;

  RAISE NOTICE '✅ リセット完了: %', v_email;
END;
$$;

-- 削除後の確認
SELECT
  'user_program_enrollments' AS table_name,
  COUNT(*) AS remaining_rows
FROM user_program_enrollments
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'calcul.support@gmail.com')
UNION ALL
SELECT
  'user_slot_assignments',
  COUNT(*)
FROM user_slot_assignments
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'calcul.support@gmail.com')
UNION ALL
SELECT
  'user_slot_one_rms',
  COUNT(*)
FROM user_slot_one_rms
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'calcul.support@gmail.com');
