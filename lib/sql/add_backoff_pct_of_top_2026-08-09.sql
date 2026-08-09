-- movement_pattern_weekly_params.backoff_pct_of_top: backoffセット重量の算出方法を、
-- 1RMからの独立した%RM（backoff_pct_rm）ではなく、メインセット提案重量に対する倍率に変更する。
--
-- 背景: 元データ（UpperLowerBodyhypertrophy9weeks_sheet.xlsx）のBackoff行は、そもそも
-- 「メインセット重量の何%か」という倍率（0.85〜0.98）を持っており、独立したbackoff_pct_rmや
-- backoff_rpeという概念は存在しなかった。program_engine.tsは初期実装時にbackoffのRPEを
-- 常に8固定でハードコードしており（元データに存在しない値）、%RMも参考重量ベースの倍率ではなく
-- 独立した%RM値として丸め直されていた。倍率をそのまま持たせることで元データに忠実にする
-- （2026-08-09）。

ALTER TABLE movement_pattern_weekly_params
  ADD COLUMN IF NOT EXISTS backoff_pct_of_top DECIMAL(4,3);

-- 各パターンの代表種目（horizontal_press=バーベルベンチプレス、squat=スクワット、
-- vertical_press=バーチカルプレス、hip_hinge=デッドリフト）の倍率をパターン単位で採用。
-- 同じパターンの他種目（インクラインベンチプレス等）にも共有適用される
-- （top_set_pct_rm/top_set_rpeが既に代表種目の値をパターン単位で共有しているのと同じ扱い）。

UPDATE movement_pattern_weekly_params SET backoff_pct_of_top = CASE week_number
  WHEN 1 THEN 0.970 WHEN 2 THEN 0.970 WHEN 3 THEN 0.950 WHEN 4 THEN 0.920
  WHEN 5 THEN 0.920 WHEN 6 THEN 0.920 WHEN 7 THEN 0.920 WHEN 8 THEN 0.950 WHEN 9 THEN 0.900
END
WHERE movement_pattern = 'horizontal_press';

UPDATE movement_pattern_weekly_params SET backoff_pct_of_top = CASE week_number
  WHEN 1 THEN 0.970 WHEN 2 THEN 0.950 WHEN 3 THEN 0.950 WHEN 4 THEN 0.950
  WHEN 5 THEN 0.920 WHEN 6 THEN 0.920 WHEN 7 THEN 0.950 WHEN 8 THEN 0.950 WHEN 9 THEN 0.900
END
WHERE movement_pattern = 'squat';

UPDATE movement_pattern_weekly_params SET backoff_pct_of_top = CASE week_number
  WHEN 1 THEN 0.950 WHEN 2 THEN 0.950 WHEN 3 THEN 0.950 WHEN 4 THEN 0.950
  WHEN 5 THEN 0.920 WHEN 6 THEN 0.900 WHEN 7 THEN 0.900 WHEN 8 THEN 0.950 WHEN 9 THEN 0.850
END
WHERE movement_pattern = 'vertical_press';

UPDATE movement_pattern_weekly_params SET backoff_pct_of_top = CASE week_number
  WHEN 1 THEN 0.930 WHEN 2 THEN 0.930 WHEN 3 THEN 0.950 WHEN 4 THEN 0.920
  WHEN 5 THEN 0.900 WHEN 6 THEN 0.880 WHEN 7 THEN 0.880 WHEN 8 THEN 0.910 WHEN 9 THEN 0.930
END
WHERE movement_pattern = 'hip_hinge';

-- 確認用: 36行全てにbackoff_pct_of_topが入っているはず（NULLが無いこと）
SELECT movement_pattern, COUNT(*) AS total, COUNT(backoff_pct_of_top) AS filled
FROM movement_pattern_weekly_params
GROUP BY movement_pattern
ORDER BY movement_pattern;
