-- ============================================================
-- 既にプログラム登録済みのユーザーの、誤った種目割り当てを修正
-- ============================================================
-- 前提: fix_program_slot_defaults.sql を先に実行しておくこと
--       （このスクリプトが参照する新規種目5件がそちらで追加されるため）
--
-- user_slot_assignments はオンボーディング時に exercise_id（user_exercises.id）を
-- 一度確定して保存する方式のため、exercise_master 側のタグ付けを直しても
-- 既存ユーザーには自動反映されない。本スクリプトは対象スロットで「誤った種目」が
-- 割り当てられているユーザーだけを対象に、正しい種目へ付け替える。
--
-- 1RM・週次進行（user_program_enrollments）・他スロットの割り当ては一切変更しない。
-- 対象ユーザーが「正しい種目」を user_exercises に未登録の場合は自動で追加する。

DO $$
DECLARE
  fix RECORD;
  wrong_master_id uuid;
  correct_master_id uuid;
  correct_is_compound boolean;
  r RECORD;
  correct_ue_id uuid;
BEGIN
  FOR fix IN
    SELECT * FROM (VALUES
      ('quad_ham_glute',         'ランジ',              'ブルガリアンスプリットスクワット'),
      ('back_horizontal_pull',   'ベントオーバーロウ',   'チェストサポーテッドロウ'),
      ('triceps',                'トライセプスプレスダウン', 'ライイングトライセプスEX'),
      ('chest_triceps_compound', 'ディップス',           'ナローベンチプレス'),
      ('quad_glute_secondary',   'ハックスクワット',     'ハイバースクワット'),
      ('biceps',                 'バーベルカール',       'ダンベルカール'),
      ('biceps_alt',             'ハンマーカール',       'インクラインダンベルカール')
    ) AS t(slot_id, wrong_name, correct_name)
  LOOP
    SELECT id INTO wrong_master_id FROM exercise_master WHERE name = fix.wrong_name;
    SELECT id, is_compound INTO correct_master_id, correct_is_compound
    FROM exercise_master WHERE name = fix.correct_name;

    IF wrong_master_id IS NULL OR correct_master_id IS NULL THEN
      RAISE NOTICE 'スキップ: % (wrong=% correct=%) が exercise_master に見つかりません',
        fix.slot_id, fix.wrong_name, fix.correct_name;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT usa.id AS assignment_id, usa.user_id
      FROM user_slot_assignments usa
      JOIN user_exercises ue ON ue.id = usa.exercise_id
      WHERE usa.slot_id = fix.slot_id
        AND ue.exercise_master_id = wrong_master_id
    LOOP
      SELECT id INTO correct_ue_id FROM user_exercises
      WHERE user_id = r.user_id AND exercise_master_id = correct_master_id;

      IF correct_ue_id IS NULL THEN
        INSERT INTO user_exercises (user_id, exercise_master_id, sort_order, is_compound)
        SELECT r.user_id, correct_master_id, COALESCE(MAX(sort_order), 0) + 1, correct_is_compound
        FROM user_exercises WHERE user_id = r.user_id
        RETURNING id INTO correct_ue_id;
      END IF;

      UPDATE user_slot_assignments
      SET exercise_id = correct_ue_id
      WHERE id = r.assignment_id;

      RAISE NOTICE 'user % : % を % → % に修正', r.user_id, fix.slot_id, fix.wrong_name, fix.correct_name;
    END LOOP;
  END LOOP;
END $$;

-- 確認
SELECT usa.user_id, usa.slot_id, em.name AS assigned_exercise
FROM user_slot_assignments usa
JOIN user_exercises ue ON ue.id = usa.exercise_id
JOIN exercise_master em ON em.id = ue.exercise_master_id
WHERE usa.slot_id IN (
  'quad_ham_glute', 'back_horizontal_pull', 'triceps',
  'chest_triceps_compound', 'quad_glute_secondary', 'biceps', 'biceps_alt'
)
ORDER BY usa.user_id, usa.slot_id;
