-- ローバースクワットが割り当たっているスロット(カテゴリ)と、現在の週・セッション時間を確認する。
-- leg_squat(6パターンの主枠)なら週次固定backoff_setsでセット数が決まるはず(3セットは合わない)。
-- leg_2/leg_default/leg_3(アクセサリー枠)ならセッション時間でセット数が決まる仕様なので、
-- 75分/90分なら3セットで正しい。
SELECT
  m.name AS exercise_name,
  m.movement_pattern,
  usa.slot_id,
  en.current_week,
  en.session_duration_minutes,
  en.days_per_week
FROM user_slot_assignments usa
JOIN user_exercises ue ON ue.id = usa.exercise_id
JOIN exercise_master m ON m.id = ue.exercise_master_id
JOIN user_program_enrollments en ON en.id = usa.enrollment_id
WHERE m.name = 'ローバースクワット' AND en.is_active = true;
