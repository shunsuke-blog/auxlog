-- exercise_master.sort_order の番号体系を整理する。
--
-- 背景: 最初期の種目は1〜52の連番、その後の個別追加は都度その時点の最大値+10、
-- 2026-07-08にまとめて追加した15種目だけ決め打ちで500〜514を割り当てていた。
-- 機能的には壊れていない（アプリは target_muscle でグルーピング表示するため、
-- 部位内の相対順序が保たれていれば問題ない）が、番号の空き・飛びが大きく
-- 追いにくいので整理する（2026-07-10）。
--
-- 新しい並び: target_muscle → tier → 元のsort_order の順（10刻み）。
-- tierを優先させるのは、fix_exercise_tier_name_mismatches.sql適用後は
-- tierがそのまま「推奨度」を表すため、番号を振り直す機会に合わせておく
-- （ただしデフォルト種目の選定自体は app/onboarding/page.tsx の
-- .order('tier').order('sort_order') が担っており、この番号整理とは独立）。
--
-- 事前に一度SELECTで結果を確認することを推奨:
--   SELECT target_muscle, tier, name,
--          ROW_NUMBER() OVER (ORDER BY target_muscle, tier, sort_order) * 10 AS new_sort_order
--   FROM exercise_master ORDER BY target_muscle, tier, sort_order;

WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY target_muscle, tier, sort_order) * 10 AS new_sort_order
  FROM exercise_master
)
UPDATE exercise_master
SET sort_order = ordered.new_sort_order
FROM ordered
WHERE exercise_master.id = ordered.id;
