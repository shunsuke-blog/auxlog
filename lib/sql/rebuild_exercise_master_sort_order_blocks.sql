-- exercise_master.sort_order を「部位ブロック→動きパターンのサブブロック→種目」の
-- 階層的な番号体系に組み直す（2026-07-10）。
--
-- renumber_exercise_master_sort_order.sql（実行済み）は単純に10刻みで詰め直しただけで
-- 「番号体系」と呼べるものではなかった、というオーナー指摘を受けての再設計。
--
-- 体系:
--   部位ブロック: 1000刻み（chest=1000,back=2000,shoulders=3000,legs=4000,arms=5000,core=6000）
--   動きパターンのサブブロック: 部位内で100刻み（movement_pattern名のアルファベット順）
--   種目: サブブロック内で5刻み（tier→旧sort_orderの順）、将来の追加種目の挿入余地を残す
--
-- 例: 腕(5000番台)の中で、elbow_extension(三頭)が5100番台、elbow_flexion(二頭)が5200番台
-- のように動きパターンごとに固まる。
--
-- ============================================================
-- Step 1: まずこのSELECTだけを実行して結果を確認する（DBは変更されない）
-- ============================================================
WITH muscle_blocks AS (
  SELECT DISTINCT target_muscle,
    CASE target_muscle
      WHEN 'chest' THEN 1 WHEN 'back' THEN 2 WHEN 'shoulders' THEN 3
      WHEN 'legs' THEN 4 WHEN 'arms' THEN 5 WHEN 'core' THEN 6
      ELSE 7
    END AS muscle_rank
  FROM exercise_master
  WHERE movement_pattern IS NOT NULL
),
pattern_blocks AS (
  SELECT DISTINCT target_muscle, movement_pattern,
    DENSE_RANK() OVER (PARTITION BY target_muscle ORDER BY movement_pattern) AS pattern_rank
  FROM exercise_master
  WHERE movement_pattern IS NOT NULL
)
SELECT em.target_muscle, em.movement_pattern, em.tier, em.name, em.sort_order AS old_sort_order,
  mb.muscle_rank * 1000
  + pb.pattern_rank * 100
  + ROW_NUMBER() OVER (PARTITION BY em.target_muscle, em.movement_pattern ORDER BY em.tier, em.sort_order) * 5
  AS new_sort_order
FROM exercise_master em
JOIN muscle_blocks mb ON mb.target_muscle = em.target_muscle
JOIN pattern_blocks pb ON pb.target_muscle = em.target_muscle AND pb.movement_pattern = em.movement_pattern
WHERE em.movement_pattern IS NOT NULL
ORDER BY new_sort_order;

-- ============================================================
-- Step 2: 上の結果に問題なければ、以下を別クエリとして実行する（実際にDBを更新する）
-- ============================================================

WITH muscle_blocks AS (
  SELECT DISTINCT target_muscle,
    CASE target_muscle
      WHEN 'chest' THEN 1 WHEN 'back' THEN 2 WHEN 'shoulders' THEN 3
      WHEN 'legs' THEN 4 WHEN 'arms' THEN 5 WHEN 'core' THEN 6
      ELSE 7
    END AS muscle_rank
  FROM exercise_master
  WHERE movement_pattern IS NOT NULL
),
pattern_blocks AS (
  SELECT DISTINCT target_muscle, movement_pattern,
    DENSE_RANK() OVER (PARTITION BY target_muscle ORDER BY movement_pattern) AS pattern_rank
  FROM exercise_master
  WHERE movement_pattern IS NOT NULL
),
numbered AS (
  SELECT em.id,
    mb.muscle_rank * 1000
    + pb.pattern_rank * 100
    + ROW_NUMBER() OVER (PARTITION BY em.target_muscle, em.movement_pattern ORDER BY em.tier, em.sort_order) * 5
    AS new_sort_order
  FROM exercise_master em
  JOIN muscle_blocks mb ON mb.target_muscle = em.target_muscle
  JOIN pattern_blocks pb ON pb.target_muscle = em.target_muscle AND pb.movement_pattern = em.movement_pattern
  WHERE em.movement_pattern IS NOT NULL
)
UPDATE exercise_master
SET sort_order = numbered.new_sort_order
FROM numbered
WHERE exercise_master.id = numbered.id;

-- movement_patternがNULLの種目（今回確認した82件には存在しなかったが念のため）は対象外のまま。
-- 万が一存在する場合は既存sort_orderを維持するため、このUPDATEでは触らない。
