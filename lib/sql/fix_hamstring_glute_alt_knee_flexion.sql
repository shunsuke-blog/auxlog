-- ============================================================
-- hamstring_glute_alt スロットを hip_hinge から knee_flexion（レッグカール）へ変更
-- ============================================================
-- 週4日Day2（スクワット4+RDL3+スモウデッド3=10セット）+Day4（デッドリフト4セット）で
-- 軸負荷（バーベルを脊柱に乗せる）種目が週14セット・3バリエーションに集中していた
-- 一方、ハムストリングの膝関節屈曲（レッグカール系）は全パターン中ゼロだった。
-- hamstring_glute_altの種目をデッドリフト（スモウ）からレッグカールに差し替え、
-- 軸負荷の集中緩和と膝屈曲パターンの穴埋めを同時に行う。
-- program_slots/program_weekly_paramsの行自体は変更不要（slot_idは維持、
-- movement_patternの変更はlib/constants/program_slots.ts側のみで完結する）。

-- レッグカールをhamstring_glute_altへ付け替え（元はhamstring_glute種目の1つとして
-- カタログに存在していた汎用種目）
UPDATE exercise_master SET slot_type = 'hamstring_glute_alt' WHERE name = 'レッグカール';

-- デッドリフト（スモウ）はhamstring_glute_altから外し、未割当のカタログ種目に戻す
UPDATE exercise_master SET slot_type = NULL WHERE name = 'デッドリフト（スモウ）';

-- 確認: hamstring_glute_altに紐づく種目がレッグカールのみになっていること
SELECT name, slot_type, movement_pattern FROM exercise_master
WHERE name IN ('レッグカール', 'デッドリフト（スモウ）');
