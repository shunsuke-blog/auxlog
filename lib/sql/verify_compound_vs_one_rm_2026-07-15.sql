-- is_compound と requires_one_rm が完全に一致しているか（「コンパウンド＝1RM管理」という
-- 単純化が既存データと矛盾しないか）を確認する。
-- 一致していない行があれば、それが「本来is_compoundの方が間違っている（例:
-- チェストプレス等は実は非コンパウンド）」のか「requires_one_rmの方を広げるべき
-- （コンパウンドなら常に1RM管理すべき）」なのか、種目名を見て個別に判断する。

SELECT name, movement_pattern, is_compound, requires_one_rm,
  CASE WHEN is_compound != requires_one_rm THEN '不一致' ELSE '一致' END AS status
FROM exercise_master
WHERE is_compound != requires_one_rm
ORDER BY is_compound DESC, movement_pattern, name;

-- 参考: 全種目の内訳（一致件数 vs 不一致件数）
SELECT
  is_compound, requires_one_rm, COUNT(*) AS count
FROM exercise_master
GROUP BY is_compound, requires_one_rm
ORDER BY is_compound DESC, requires_one_rm DESC;
