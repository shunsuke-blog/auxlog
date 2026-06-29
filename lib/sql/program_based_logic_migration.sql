-- =====================================================================
-- Auxlog: プログラムベース提案ロジック DBマイグレーション
-- 設計書: .company/engineering/docs/program-based-logic-design.md
-- =====================================================================

-- =====================================================================
-- 1. テーブル定義
-- =====================================================================

ALTER TABLE exercise_master ADD COLUMN IF NOT EXISTS slot_type TEXT;

CREATE TABLE IF NOT EXISTS programs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  total_weeks  INTEGER     NOT NULL,
  days_per_week INTEGER    NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_slots (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id    UUID    NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  slot_id       TEXT    NOT NULL,
  day_number    INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 4),
  muscle_group  TEXT    NOT NULL,
  is_compound   BOOLEAN NOT NULL,
  has_one_rm    BOOLEAN NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  sort_order    INTEGER NOT NULL,
  UNIQUE (program_id, slot_id)
);

CREATE TABLE IF NOT EXISTS program_weekly_params (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  slot_id           TEXT        NOT NULL,
  week_number       INTEGER     NOT NULL CHECK (week_number BETWEEN 1 AND 9),
  -- コンパウンド (%RM管理あり)
  top_set_pct_rm    DECIMAL(4,3),
  top_set_reps      INTEGER,
  top_set_is_amrap  BOOLEAN     DEFAULT FALSE,
  top_set_rpe       DECIMAL(3,1),
  backoff_sets      INTEGER,
  backoff_pct_rm    DECIMAL(4,3),
  backoff_reps      INTEGER,
  -- アイソレーション / コンパウンドでhas_one_rm=false
  working_sets      INTEGER,
  rep_range_min     INTEGER,
  rep_range_max     INTEGER,
  rpe               DECIMAL(3,1),
  -- メタ
  phase             TEXT        NOT NULL CHECK (phase IN ('volume','intensity','deload','maxout')),
  is_excluded       BOOLEAN     NOT NULL DEFAULT FALSE,
  UNIQUE (program_id, slot_id, week_number)
);

CREATE TABLE IF NOT EXISTS user_program_enrollments (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id               UUID    NOT NULL REFERENCES programs(id),
  current_week             INTEGER NOT NULL DEFAULT 1 CHECK (current_week BETWEEN 1 AND 9),
  days_per_week            INTEGER NOT NULL DEFAULT 4 CHECK (days_per_week BETWEEN 2 AND 4),
  session_duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK (session_duration_minutes IN (60, 75, 90)),
  started_at               DATE    NOT NULL DEFAULT CURRENT_DATE,
  completed_at             DATE,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_slot_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES user_program_enrollments(id) ON DELETE CASCADE,
  slot_id       TEXT NOT NULL,
  exercise_id   UUID NOT NULL REFERENCES user_exercises(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (enrollment_id, slot_id)
);

CREATE TABLE IF NOT EXISTS user_slot_one_rms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id     TEXT        NOT NULL,
  one_rm_kg   DECIMAL(6,1) NOT NULL,
  recorded_at DATE        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'manual_input'
                CHECK (source IN ('manual_input','epley_estimated','w9_amrap_estimation')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. RLS
-- =====================================================================

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programs: readable by all"
  ON programs FOR SELECT USING (true);

ALTER TABLE program_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "program_slots: readable by all"
  ON program_slots FOR SELECT USING (true);

ALTER TABLE program_weekly_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "program_weekly_params: readable by all"
  ON program_weekly_params FOR SELECT USING (true);

ALTER TABLE user_program_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_program_enrollments: own rows only"
  ON user_program_enrollments FOR ALL USING (auth.uid() = user_id);

ALTER TABLE user_slot_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_slot_assignments: own rows only"
  ON user_slot_assignments FOR ALL USING (auth.uid() = user_id);

ALTER TABLE user_slot_one_rms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_slot_one_rms: own rows only"
  ON user_slot_one_rms FOR ALL USING (auth.uid() = user_id);

-- =====================================================================
-- 3. インデックス
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_program_slots_day
  ON program_slots (program_id, day_number, sort_order);

CREATE INDEX IF NOT EXISTS idx_program_weekly_params_lookup
  ON program_weekly_params (program_id, slot_id, week_number);

CREATE INDEX IF NOT EXISTS idx_user_enrollments_active
  ON user_program_enrollments (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_slot_assignments_enrollment
  ON user_slot_assignments (enrollment_id, slot_id);

CREATE INDEX IF NOT EXISTS idx_user_slot_one_rms_latest
  ON user_slot_one_rms (user_id, slot_id, recorded_at DESC);

-- =====================================================================
-- 4. シードデータ: programs
-- =====================================================================

INSERT INTO programs (id, name, total_weeks, days_per_week) VALUES
  ('00000000-0000-0000-0001-000000000001', 'UL Body Hypertrophy 9 Weeks', 9, 4)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 5. シードデータ: program_slots (23スロット)
-- =====================================================================

INSERT INTO program_slots (program_id, slot_id, day_number, muscle_group, is_compound, has_one_rm, priority, sort_order) VALUES
  -- Day 1 Upper
  ('00000000-0000-0000-0001-000000000001', 'chest_compound',          1, '胸',   true,  true,  1, 1),
  ('00000000-0000-0000-0001-000000000001', 'back_vertical_pull',      1, '背中', true,  false, 1, 2),
  ('00000000-0000-0000-0001-000000000001', 'back_horizontal_pull',    1, '背中', true,  false, 1, 3),
  ('00000000-0000-0000-0001-000000000001', 'shoulder_lateral',        1, '肩',   false, false, 2, 4),
  ('00000000-0000-0000-0001-000000000001', 'shoulder_rear_delt',      1, '肩',   false, false, 2, 5),
  ('00000000-0000-0000-0001-000000000001', 'triceps',                 1, '腕',   false, false, 3, 6),
  ('00000000-0000-0000-0001-000000000001', 'biceps',                  1, '腕',   false, false, 3, 7),
  -- Day 2 Lower
  ('00000000-0000-0000-0001-000000000001', 'quad_glute_primary',      2, '脚',     true,  true,  1, 1),
  ('00000000-0000-0000-0001-000000000001', 'hamstring_glute',         2, '脚',     true,  false, 1, 2),
  ('00000000-0000-0000-0001-000000000001', 'quad_ham_glute',          2, '脚',     true,  false, 2, 3),
  ('00000000-0000-0000-0001-000000000001', 'calves_seated',           2, 'カーフ', false, false, 2, 4),
  ('00000000-0000-0000-0001-000000000001', 'core',                    2, '腹筋',   false, false, 2, 5),
  -- Day 3 Upper
  ('00000000-0000-0000-0001-000000000001', 'shoulder_vertical_press',    3, '肩',   true,  true,  1, 1),
  ('00000000-0000-0000-0001-000000000001', 'chest_triceps_compound',     3, '胸',   true,  true,  1, 2),
  ('00000000-0000-0000-0001-000000000001', 'back_horizontal_pull_heavy', 3, '背中', true,  false, 1, 3),
  ('00000000-0000-0000-0001-000000000001', 'back_vertical_pull_alt',     3, '背中', true,  false, 1, 4),
  ('00000000-0000-0000-0001-000000000001', 'chest_isolation',            3, '胸',   false, false, 2, 5),
  ('00000000-0000-0000-0001-000000000001', 'shoulder_lateral_cable',     3, '肩',   false, false, 2, 6),
  ('00000000-0000-0000-0001-000000000001', 'biceps_alt',                 3, '腕',   false, false, 3, 7),
  -- Day 4 Lower
  ('00000000-0000-0000-0001-000000000001', 'hamstring_glute_heavy',  4, '脚',     true,  true,  1, 1),
  ('00000000-0000-0000-0001-000000000001', 'quad_glute_secondary',   4, '脚',     true,  true,  1, 2),
  ('00000000-0000-0000-0001-000000000001', 'calves_standing',        4, 'カーフ', false, false, 2, 3),
  ('00000000-0000-0000-0001-000000000001', 'core_alt',               4, '腹筋',   false, false, 2, 4)
ON CONFLICT (program_id, slot_id) DO NOTHING;

-- =====================================================================
-- 6. シードデータ: program_weekly_params - コンパウンド (%RM管理)
-- =====================================================================

-- chest_compound (Day 1)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','chest_compound',1, 0.78, 5,    false, 6.0, 4,    0.75, 5,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',2, 0.78, 6,    false, 7.0, 4,    0.75, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',3, 0.80, 5,    false, 7.0, 5,    0.75, 5,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',4, 0.80, 6,    false, 8.0, 5,    0.73, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',5, 0.82, 5,    false, 8.0, 5,    0.75, 5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',6, 0.84, 4,    false, 8.0, 5,    0.77, 4,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',7, 0.84, 5,    false, 9.0, 4,    0.77, 5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',8, 0.86, 4,    false, 9.0, 2,    0.81, 4,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','chest_compound',9, 0.86, NULL, true,  10.0,2,    0.77, 4,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- quad_glute_primary (Day 2)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',1, 0.80, 4,    false, 6.0, 3, 0.76, 4,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',2, 0.80, 5,    false, 7.0, 4, 0.75, 5,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',3, 0.78, 6,    false, 7.0, 5, 0.74, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',4, 0.82, 4,    false, 7.0, 5, 0.78, 4,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',5, 0.82, 5,    false, 8.0, 5, 0.76, 5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',6, 0.80, 6,    false, 8.0, 4, 0.74, 6,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',7, 0.84, 4,    false, 8.0, 4, 0.79, 4,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',8, 0.84, 5,    false, 9.0, 2, 0.79, 5,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_primary',9, 0.85, NULL, true,  10.0,2, 0.76, 5,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- shoulder_vertical_press (Day 3)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',1, 0.75, 6,    false, 6.0, 3, 0.73, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',2, 0.75, 7,    false, 7.0, 3, 0.73, 7,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',3, 0.73, 8,    false, 7.0, 3, 0.69, 8,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',4, 0.77, 6,    false, 7.0, 3, 0.73, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',5, 0.77, 7,    false, 8.0, 3, 0.69, 7,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',6, 0.74, 8,    false, 8.0, 3, 0.65, 8,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',7, 0.80, 6,    false, 9.0, 3, 0.73, 6,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',8, 0.77, 7,    false, 9.0, 2, 0.73, 7,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_vertical_press',9, 0.80, NULL, true,  10.0,2, 0.69, 7,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- chest_triceps_compound (Day 3) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',1, 0.70, 7,    false, 6.0, 3,    0.69, 7,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',2, 0.70, 8,    false, 7.0, 3,    0.69, 8,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',3, 0.72, 7,    false, 7.0, 4,    0.69, 7,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',4, 0.72, 8,    false, 8.0, 4,    0.67, 8,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',5, 0.74, 7,    false, 8.0, 4,    0.69, 7,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',6, 0.72, 8,    false, 8.0, 4,    0.67, 8,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',7, 0.76, 6,    false, 8.0, 4,    0.69, 6,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',8, 0.76, 5,    false, 9.0, 2,    0.71, 5,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','chest_triceps_compound',9, NULL, NULL, false, NULL,NULL, NULL, NULL,'maxout',true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- hamstring_glute_heavy (Day 4)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',1, 0.76, 5,    false, 5.0, 3, 0.71, 5,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',2, 0.76, 6,    false, 6.0, 4, 0.71, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',3, 0.76, 6,    false, 6.0, 4, 0.73, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',4, 0.78, 6,    false, 7.0, 5, 0.71, 6,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',5, 0.80, 5,    false, 7.0, 5, 0.73, 5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',6, 0.80, 6,    false, 8.0, 5, 0.70, 6,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',7, 0.82, 5,    false, 8.0, 4, 0.73, 5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',8, 0.82, 6,    false, 9.0, 2, 0.75, 6,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute_heavy',9, 0.85, NULL, true,  9.5, 2, 0.79, 6,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- quad_glute_secondary (Day 4) — W9はAMRAPなし・除外なし
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',1, 0.72, 8, false, 6.0, 2, 0.70, 8,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',2, 0.72, 9, false, 7.0, 3, 0.69, 9,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',3, 0.72, 9, false, 7.0, 3, 0.70, 9,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',4, 0.75, 8, false, 7.0, 4, 0.71, 8,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',5, 0.72, 9, false, 7.0, 4, 0.66, 9,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',6, 0.74, 8, false, 7.0, 4, 0.73, 8,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',7, 0.72, 9, false, 7.0, 3, 0.71, 9,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',8, 0.75, 8, false, 9.0, 2, 0.71, 8,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','quad_glute_secondary',9, 0.70, 8, false, 6.0, 2, 0.70, 8,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- =====================================================================
-- 7. シードデータ: program_weekly_params - アイソレーション / RPE管理
-- =====================================================================

-- back_vertical_pull (Day 1) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',1, 3,    9,    11,   7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',2, 3,    9,    11,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',3, 3,    10,   12,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',4, 3,    10,   12,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',5, 3,    8,    10,   8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',6, 3,    8,    10,   8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',7, 3,    8,    10,   8.5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',8, 2,    8,    10,   9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- back_horizontal_pull (Day 1) — W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',1, 3, 9,  11, 7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',2, 3, 9,  11, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',3, 3, 10, 12, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',4, 3, 10, 12, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',5, 3, 8,  10, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',6, 3, 8,  10, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',7, 3, 8,  10, 8.5,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',8, 2, 8,  10, 9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull',9, 2, 10, 12, 7.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- shoulder_lateral (Day 1) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',1, 3,    12,   14,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',2, 3,    12,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',3, 3,    12,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',4, 3,    12,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',5, 4,    10,   12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',6, 4,    10,   12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',7, 3,    10,   12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',8, 3,    10,   12,   10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- shoulder_rear_delt (Day 1) — W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',1, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',2, 3, 15, 20, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',3, 3, 15, 20, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',4, 3, 15, 20, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',5, 3, 12, 15, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',6, 3, 12, 15, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',7, 3, 12, 15, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',8, 3, 12, 15, 10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','shoulder_rear_delt',9, 3, 10, 12, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- triceps (Day 1) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','triceps',1, 3,    10,   12,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','triceps',2, 3,    10,   12,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','triceps',3, 3,    9,    11,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','triceps',4, 3,    9,    11,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','triceps',5, 3,    8,    10,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','triceps',6, 3,    8,    10,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','triceps',7, 3,    7,    9,    9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','triceps',8, 2,    7,    9,    10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','triceps',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- biceps (Day 1) — W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','biceps',1, 3, 10, 12, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps',2, 3, 10, 12, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps',3, 3, 12, 14, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps',4, 3, 12, 14, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps',5, 3, 8,  10, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps',6, 3, 8,  10, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps',7, 3, 7,  9,  9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps',8, 2, 7,  9,  10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','biceps',9, 2, 10, 12, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- hamstring_glute (Day 2) — W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',1, 3, 10, 12, 7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',2, 3, 10, 12, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',3, 4, 8,  10, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',4, 4, 8,  10, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',5, 4, 8,  10, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',6, 3, 7,  9,  8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',7, 3, 7,  9,  8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',8, 2, 7,  9,  9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','hamstring_glute',9, 2, 10, 12, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- quad_ham_glute (Day 2) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',1, 3,    12,   14,   7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',2, 3,    12,   14,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',3, 4,    8,    10,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',4, 4,    8,    10,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',5, 3,    14,   16,   8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',6, 3,    14,   16,   8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',7, 3,    10,   12,   8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',8, 2,    10,   12,   9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','quad_ham_glute',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- calves_seated (Day 2) — W1-7 RPE=8 (range fix済み)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','calves_seated',1, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',2, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',3, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',4, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',5, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',6, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',7, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',8, 2, 15, 20, 10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','calves_seated',9, 2, 15, 20, 9.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- core (Day 2) — W5-7 rep_range=6-12, W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','core',1, 2,    12,   15,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core',2, 3,    12,   15,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core',3, 3,    12,   15,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core',4, 3,    12,   15,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core',5, 3,    6,    12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core',6, 3,    6,    12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core',7, 3,    6,    12,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core',8, 2,    6,    10,   9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','core',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- back_horizontal_pull_heavy (Day 3) — sets/RPE range fix済み, W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',1, 3,    6,    8,    7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',2, 3,    6,    8,    8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',3, 3,    8,    10,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',4, 3,    8,    10,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',5, 3,    7,    9,    8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',6, 3,    7,    9,    8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',7, 3,    7,    9,    8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',8, 2,    7,    9,    9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','back_horizontal_pull_heavy',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- back_vertical_pull_alt (Day 3) — sets/RPE range fix済み, W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',1, 3, 6,  8,  7.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',2, 3, 6,  8,  8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',3, 3, 8,  10, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',4, 3, 8,  10, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',5, 3, 7,  9,  8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',6, 3, 7,  9,  8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',7, 3, 7,  9,  8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',8, 2, 7,  9,  9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','back_vertical_pull_alt',9, 2, 6,  8,  7.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- chest_isolation (Day 3) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','chest_isolation',1, 3,    10,   12,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',2, 3,    10,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',3, 3,    10,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',4, 3,    12,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',5, 3,    12,   18,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',6, 3,    12,   18,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',7, 3,    12,   18,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',8, 2,    14,   18,   10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','chest_isolation',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- shoulder_lateral_cable (Day 3) — RPE range fix済み, W9 not excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',1, 3, 12, 15, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',2, 3, 12, 15, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',3, 3, 12, 20, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',4, 3, 12, 20, 9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',5, 3, 15, 20, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',6, 3, 15, 20, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',7, 3, 18, 22, 9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',8, 3, 18, 22, 9.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','shoulder_lateral_cable',9, 3, 12, 20, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- biceps_alt (Day 3) — W9 excluded
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','biceps_alt',1, 3,    10,   12,   8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',2, 3,    10,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',3, 3,    10,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',4, 3,    12,   14,   9.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',5, 3,    14,   16,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',6, 3,    14,   20,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',7, 3,    14,   20,   9.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',8, 2,    15,   20,   10.0,'deload',  false),
  ('00000000-0000-0000-0001-000000000001','biceps_alt',9, NULL, NULL, NULL, NULL,'maxout',  true)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- calves_standing (Day 4) — RPE range fix済み (W8-9 = 8)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','calves_standing',1, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',2, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',3, 4, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',4, 4, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',5, 4, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',6, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',7, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',8, 2, 15, 20, 8.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','calves_standing',9, 2, 15, 20, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;

-- core_alt (Day 4) — RPE range fix済み (W2-9 = 8)
INSERT INTO program_weekly_params
  (program_id, slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, phase, is_excluded)
VALUES
  ('00000000-0000-0000-0001-000000000001','core_alt',1, 2, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core_alt',2, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core_alt',3, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core_alt',4, 3, 15, 20, 8.0,'volume',   false),
  ('00000000-0000-0000-0001-000000000001','core_alt',5, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core_alt',6, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core_alt',7, 3, 15, 20, 8.0,'intensity',false),
  ('00000000-0000-0000-0001-000000000001','core_alt',8, 2, 15, 20, 8.0,'deload',   false),
  ('00000000-0000-0000-0001-000000000001','core_alt',9, 2, 15, 20, 8.0,'maxout',   false)
ON CONFLICT (program_id, slot_id, week_number) DO NOTHING;
