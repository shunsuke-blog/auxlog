-- カーフ・腹筋種目を追加（slot_type 付き）
-- 既に存在する場合はスキップ

INSERT INTO exercise_master (name, target_muscle, sort_order, is_bodyweight, is_compound, slot_type)
SELECT name, target_muscle,
       (SELECT COALESCE(MAX(sort_order), 0) FROM exercise_master) + row_number() OVER () * 10,
       is_bodyweight, false, slot_type
FROM (VALUES
  ('シーテッドカーフレイズ',    'legs', false, 'calves_seated'),
  ('スタンディングカーフレイズ', 'legs', false, 'calves_standing'),
  ('アブローラー',              'core', true,  'core'),
  ('ハンギングニーレイズ',       'core', true,  'core'),
  ('レッグレイズ',              'core', true,  'core_alt'),
  ('クランチ',                  'core', true,  'core_alt')
) AS t(name, target_muscle, is_bodyweight, slot_type)
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_master WHERE exercise_master.name = t.name
);
