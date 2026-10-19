-- RLS（Row Level Security）設定確認クエリ（2026-07-14追加分）
-- 既存のverify_rls.sqlは初期テーブル(users/exercise_master/user_exercises/
-- training_sessions/training_sets)のみが対象。9週間プログラム導入後に追加された
-- テーブルは未確認のため、Supabase SQL Editorで実行して確認してください。
--
-- auxlog-mobileのコードレビューで判明: user_exercisesへの更新/削除クエリの一部が
-- user_idでの絞り込みなしにidのみで発行されており（deleteExercise等）、RLSに
-- 完全依存する設計になっている。RLSが正しく有効化されていない場合、他ユーザーの
-- 行を更新・削除できてしまう。

-- 1. 対象テーブルのRLS有効化状況を確認
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_program_enrollments',
    'user_slot_assignments',
    'user_program_day_extras',
    'user_slot_one_rms',
    'exercise_bests'
  )
ORDER BY tablename;

-- 期待値: 全テーブルでrowsecurity = true

-- 2. 各テーブルのポリシー一覧を確認
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_program_enrollments',
    'user_slot_assignments',
    'user_program_day_extras',
    'user_slot_one_rms',
    'exercise_bests'
  )
ORDER BY tablename, policyname; 

-- 期待値: 各テーブルに「user_id = auth.uid()」相当の条件を持つALLポリシーが
-- 存在すること（qual列にauth.uid()との比較が含まれているか目視確認）。

-- 3. RLSが無効、またはポリシーが存在しないテーブルがあれば個別に対応が必要
-- （このファイルではALTER/CREATE POLICYは実行しない。結果を見てから判断する）
