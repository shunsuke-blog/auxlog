-- 不足している種目を一括追加
-- 懸垂・ヒップアブダクション・ヒップアダクション
-- 既に存在する場合はスキップ

INSERT INTO exercise_master (name, target_muscle, sort_order, is_bodyweight, is_compound, slot_type)
SELECT name, target_muscle,
       (SELECT COALESCE(MAX(sort_order), 0) FROM exercise_master) + row_number() OVER () * 10,
       is_bodyweight, is_compound, slot_type
FROM (VALUES
  -- 懸垂: Day1 の back_vertical_pull スロットに追加（週2回でも表示されるようにする）
  ('懸垂',               'back', true,  true,  'back_vertical_pull'),
  -- ヒップアブダクション・アダクション: quad_ham_glute (Day2) スロット
  ('ヒップアブダクション', 'legs', false, false, 'quad_ham_glute'),
  ('ヒップアダクション',   'legs', false, false, 'quad_ham_glute')
) AS t(name, target_muscle, is_bodyweight, is_compound, slot_type)
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_master WHERE exercise_master.name = t.name
);

-- back_vertical_pull_alt (Day3) のデフォルト種目として
-- チンアップ（懸垂）が存在すれば Day3 スロットにも割り当て
UPDATE exercise_master
SET slot_type = 'back_vertical_pull_alt'
WHERE name = 'チンアップ（懸垂）'
  AND NOT EXISTS (
    SELECT 1 FROM exercise_master WHERE slot_type = 'back_vertical_pull_alt'
  );

-- 確認
SELECT name, slot_type, is_bodyweight
FROM exercise_master  
WHERE name IN ('懸垂', 'チンアップ（懸垂）', 'ヒップアブダクション', 'ヒップアダクション')
ORDER BY name;
