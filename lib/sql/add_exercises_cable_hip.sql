-- ケーブルフライ（上部・中部・下部）、ケーブルプレスダウン、ヒップスラストを追加
-- slot_type も同時に設定する
-- 既に存在する場合はスキップ（name に UNIQUE 制約がある前提）

INSERT INTO exercise_master (name, target_muscle, sort_order, is_bodyweight, is_compound, slot_type)
SELECT name, target_muscle,
       (SELECT COALESCE(MAX(sort_order), 0) FROM exercise_master) + row_number() OVER () * 10,
       false, is_compound, slot_type
FROM (VALUES
  ('ケーブルフライ（上部）', 'chest',     false, 'chest_isolation'),
  ('ケーブルフライ（中部）', 'chest',     false, 'chest_isolation'),
  ('ケーブルフライ（下部）', 'chest',     false, 'chest_isolation'),
  ('ケーブルプレスダウン',   'arms',      false, 'triceps'),
  ('ヒップスラスト',         'legs',      true,  'hamstring_glute')
) AS t(name, target_muscle, is_compound, slot_type)
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_master WHERE exercise_master.name = t.name
);
