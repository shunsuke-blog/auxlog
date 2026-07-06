-- ============================================================
-- exercise_master に intensity_technique 列を追加
-- ============================================================
-- 実装依頼: メソサイクル tier別漸進レバー（2026-07-06、~/Downloads/メソサイクル_tier別漸進レバー_実装依頼.md）
-- ~60tier（エフォート型漸進）で、アイソレーション/マシン種目の最終セットに
-- レストポーズ／ミオレップを許可するためのフラグ。デフォルトは'none'（未割当）。
-- 個々の種目への割り当ては別途オーナー判断で行う（本SQLでは列追加のみ）。

ALTER TABLE exercise_master
  ADD COLUMN IF NOT EXISTS intensity_technique TEXT NOT NULL DEFAULT 'none'
  CHECK (intensity_technique IN ('rest_pause', 'myo_reps', 'none'));
