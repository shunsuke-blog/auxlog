-- movement_pattern_weekly_params: 種目のmovement_pattern単位で%RM進行データを持つテーブル。
--
-- 背景: program_weekly_paramsはカテゴリ(slot_id)単位のため、「カテゴリの既定はhasOneRm:false
-- だが、割り当てられた種目はrequires_one_rm:true」というケース（leg_hingeにデッドリフト、
-- shoulder_press_2にダンベルショルダープレス等）で%RMデータが存在せず、フォールバック
-- (buildCompoundSetsFromIsolationParams、暫定%RM 0.8/0.75)に頼っていた。
-- 1RM管理の要否は種目単位の属性(exercise_master.requires_one_rm)なのに対し、%RMの実データが
-- カテゴリ単位でしか持てない構造のズレが根本原因（2026-07-15、is_compound/requires_one_rm
-- 不一致調査から発覚）。
--
-- 対応: %RM進行データを「動きパターン(movement_pattern)」単位に持たせ直す。同じ動きパターンの
-- 1RM管理種目（例: squatパターンのローバースクワット・ハックスクワット・レッグプレス）は
-- 同じ%RM進行を共有する。program_engine.tsはrequires_one_rm:trueの種目に対し、所属カテゴリ
-- ではなくexercise.movement_patternでこのテーブルを引く。

CREATE TABLE IF NOT EXISTS movement_pattern_weekly_params (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  movement_pattern  TEXT        NOT NULL,
  week_number       INTEGER     NOT NULL CHECK (week_number BETWEEN 1 AND 9),
  top_set_pct_rm    DECIMAL(4,3),
  top_set_reps      INTEGER,
  top_set_is_amrap  BOOLEAN     NOT NULL DEFAULT FALSE,
  top_set_rpe       DECIMAL(3,1),
  backoff_sets      INTEGER,
  backoff_pct_rm    DECIMAL(4,3),
  backoff_reps      INTEGER,
  phase             TEXT        NOT NULL CHECK (phase IN ('volume','intensity','deload','maxout')),
  UNIQUE (program_id, movement_pattern, week_number)
);

ALTER TABLE movement_pattern_weekly_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movement_pattern_weekly_params: readable by all"
  ON movement_pattern_weekly_params FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_movement_pattern_weekly_params_lookup
  ON movement_pattern_weekly_params (program_id, movement_pattern, week_number);

-- バックフィル: 現時点でrequires_one_rm:trueの種目が実際に存在する4パターン分のみ、
-- 既存の6パターンカテゴリ（chest_press/shoulder_press/leg_squat）と、hip_hingeについては
-- leg_3（2026-07-08migrationでhamstring_glute_heavyからコピー済みの重いヒンジ用%RMデータ）
-- から移す。horizontal_pull/vertical_pullは現在1RM管理される種目が存在しないため未投入
-- （back_row/back_pullの%RM列も現状NULLで、コピーしても意味のあるデータにならないため）。
-- 将来1RM管理の横引き/縦引き種目を追加する場合は、同じ形式でINSERT文を追加すること。

INSERT INTO movement_pattern_weekly_params
  (program_id, movement_pattern, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase)
SELECT program_id, 'horizontal_press', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase
FROM program_weekly_params WHERE slot_id = 'chest_press'
ON CONFLICT (program_id, movement_pattern, week_number) DO NOTHING;

INSERT INTO movement_pattern_weekly_params
  (program_id, movement_pattern, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase)
SELECT program_id, 'vertical_press', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase
FROM program_weekly_params WHERE slot_id = 'shoulder_press'
ON CONFLICT (program_id, movement_pattern, week_number) DO NOTHING;

INSERT INTO movement_pattern_weekly_params
  (program_id, movement_pattern, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase)
SELECT program_id, 'squat', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase
FROM program_weekly_params WHERE slot_id = 'leg_squat'
ON CONFLICT (program_id, movement_pattern, week_number) DO NOTHING;

INSERT INTO movement_pattern_weekly_params
  (program_id, movement_pattern, week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase)
SELECT program_id, 'hip_hinge', week_number, top_set_pct_rm, top_set_reps, top_set_is_amrap, top_set_rpe, backoff_sets, backoff_pct_rm, backoff_reps, phase
FROM program_weekly_params WHERE slot_id = 'leg_3'
ON CONFLICT (program_id, movement_pattern, week_number) DO NOTHING;

-- 確認用: 4パターン×9週=36行が入っているはず
SELECT movement_pattern, COUNT(*) AS week_count
FROM movement_pattern_weekly_params
GROUP BY movement_pattern
ORDER BY movement_pattern;
