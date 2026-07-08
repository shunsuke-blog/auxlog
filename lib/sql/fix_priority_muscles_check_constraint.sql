-- user_program_enrollments.priority_muscles の CHECK 制約が、旧TargetMuscle
-- （chest/back/legs/shoulders/arms/core の6値）のままになっており、新しい
-- PriorityMuscleOption（二頭biceps・三頭tricepsを分離した7値）を拒否していた。
-- 本番で「プログラム登録に失敗しました」(code 23514, check_violation)として発生
-- （2026-07-08、実機確認フィードバック対応）。

ALTER TABLE user_program_enrollments DROP CONSTRAINT IF EXISTS user_program_enrollments_priority_muscles_check;

ALTER TABLE user_program_enrollments ADD CONSTRAINT user_program_enrollments_priority_muscles_check
  CHECK (priority_muscles <@ ARRAY['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core']::text[]);
