-- movement_pattern_weekly_params.backoff_pct_rmを削除する。
--
-- 2026-08-09のbackoff_pct_of_top導入（program_engine.tsのbackoff重量算出を
-- 「メインセット提案重量×倍率」に変更）により、この列は一切参照されなくなった
-- （add_backoff_pct_of_top_2026-08-09.sql参照）。使われていない列を残すと、
-- 将来backoff重量の根拠として誤って参照されるおそれがあるため削除する。

ALTER TABLE movement_pattern_weekly_params DROP COLUMN IF EXISTS backoff_pct_rm;
