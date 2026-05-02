-- RLS（Row Level Security）設定確認クエリ
-- Supabase SQL Editor で実行して、全テーブルの RLS が有効か確認してください

-- 1. RLS が有効なテーブルを確認
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 期待値: users, exercise_master, user_exercises, training_sessions, training_sets
-- すべて rowsecurity = true であること

-- 2. 各テーブルのポリシー一覧を確認
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 期待値:
-- users: "users can only access own data" (ALL)
-- exercise_master: "exercise_master is readable by all" (SELECT)
-- user_exercises: "users can only access own exercises" (ALL)
-- training_sessions: "users can only access own sessions" (ALL)
-- training_sets: "users can only access own sets" (ALL)

-- 3. RLS が無効なテーブルがあれば有効化
-- ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
