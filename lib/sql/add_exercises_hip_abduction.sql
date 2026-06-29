-- ヒップアブダクション・ヒップアダクションを追加
-- quad_ham_glute スロット（脚・補助種目）に割り当て
-- has_one_rm = false のため、rep-range ベースで重量提案される
-- 既に存在する場合はスキップ

INSERT INTO exercise_master (name, target_muscle, sort_order, is_bodyweight, is_compound, slot_type)
SELECT name, target_muscle,
       (SELECT COALESCE(MAX(sort_order), 0) FROM exercise_master) + row_number() OVER () * 10,
       false, false, slot_type
FROM (VALUES
  ('ヒップアブダクション', 'legs', 'quad_ham_glute'),
  ('ヒップアダクション',   'legs', 'quad_ham_glute')
) AS t(name, target_muscle, slot_type)
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_master WHERE exercise_master.name = t.name
);
