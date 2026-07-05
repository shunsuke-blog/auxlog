-- ============================================================
-- 週2日版で「アクセサリー種目」扱いのスロットにworking_setsが
-- 無いことによる、ホーム画面からの消失を修正（2026-07-05）
-- ============================================================
-- 背景: lib/constants/program_slots.ts で shoulder_vertical_press /
-- chest_triceps_compound / quad_glute_secondary は週2日版のみ
-- has_one_rm: false（直近実績ベースのアクセサリー種目として設計）
-- だが、program_weekly_params 側は全頻度共通で複合種目形式
-- （top_set_pct_rm等）のままで working_sets が未設定だった。
-- program_engine.ts の buildIsolationSets は working_sets が無いと
-- 空配列を返し、スロットが黙って消える（chest_triceps_compoundの
-- 4日/3日版で発生した不具合と全く同じ構造）。
--
-- 対応: 各週の backoff_sets/backoff_reps を土台に、アイソレーション
-- 用のフィールドを補完する。複合種目としての計算（has_one_rm=true
-- な4日/3日版）には working_sets は使われないため影響なし。

UPDATE program_weekly_params
SET working_sets = backoff_sets + 1,
    rep_range_min = GREATEST(backoff_reps - 2, 1),
    rep_range_max = backoff_reps + 2,
    rpe = COALESCE(top_set_rpe, 8)
WHERE slot_id IN ('shoulder_vertical_press', 'chest_triceps_compound', 'quad_glute_secondary')
  AND is_excluded = false
  AND backoff_sets IS NOT NULL;

-- 確認
SELECT slot_id, week_number, working_sets, rep_range_min, rep_range_max, rpe, is_excluded
FROM program_weekly_params
WHERE slot_id IN ('shoulder_vertical_press', 'chest_triceps_compound', 'quad_glute_secondary')
ORDER BY slot_id, week_number;
