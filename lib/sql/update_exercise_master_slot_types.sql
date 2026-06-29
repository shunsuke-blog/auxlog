-- ============================================================
-- exercise_master.slot_type を全種目に設定する
-- ============================================================
-- プログラムスロットに対応する種目は slot_type を設定。
-- 複数スロットに登場する種目は最初のスロット（Day 番号小・sort_order 小）を優先。

-- Day 1 ───────────────────────────────────
UPDATE exercise_master SET slot_type = 'chest_compound'
  WHERE name IN ('ベンチプレス', 'インクラインベンチプレス', 'ダンベルベンチプレス');

UPDATE exercise_master SET slot_type = 'back_vertical_pull'
  WHERE name IN ('ラットプルダウン', 'チンアップ（懸垂）');

UPDATE exercise_master SET slot_type = 'back_horizontal_pull'
  WHERE name IN ('チェストサポーテッドロウ', 'ベントオーバーロウ');

UPDATE exercise_master SET slot_type = 'shoulder_lateral'
  WHERE name IN ('サイドレイズ');

UPDATE exercise_master SET slot_type = 'shoulder_rear_delt'
  WHERE name IN ('フェイスプル', 'リバースフライ');

UPDATE exercise_master SET slot_type = 'triceps'
  WHERE name IN ('ライイングトライセプスEX', 'トライセプスプレスダウン');

UPDATE exercise_master SET slot_type = 'biceps'
  WHERE name IN ('ダンベルカール', 'バーベルカール');

-- Day 2 ───────────────────────────────────
UPDATE exercise_master SET slot_type = 'quad_glute_primary'
  WHERE name IN ('スクワット', 'レッグプレス');

UPDATE exercise_master SET slot_type = 'hamstring_glute'
  WHERE name IN ('ルーマニアンデッドリフト', 'レッグカール', 'ヒップスラスト');

UPDATE exercise_master SET slot_type = 'quad_ham_glute'
  WHERE name IN ('ブルガリアンスクワット', 'ランジ');

UPDATE exercise_master SET slot_type = 'calves_seated'
  WHERE name IN ('シーテッドカーフレイズ');

UPDATE exercise_master SET slot_type = 'core'
  WHERE name IN ('アブローラー', 'ハンギングニーレイズ');

-- Day 3 ───────────────────────────────────
UPDATE exercise_master SET slot_type = 'shoulder_vertical_press'
  WHERE name IN ('オーバーヘッドプレス', 'ダンベルショルダープレス');

UPDATE exercise_master SET slot_type = 'chest_triceps_compound'
  WHERE name IN ('ナローベンチプレス', 'ディップス');

UPDATE exercise_master SET slot_type = 'back_horizontal_pull_heavy'
  WHERE name IN ('ワンハンドロウ', 'ペンドレイロウ');

-- 懸垂（チンアップ（懸垂）とは別種目）
UPDATE exercise_master SET slot_type = 'back_vertical_pull_alt'
  WHERE name IN ('懸垂');

UPDATE exercise_master SET slot_type = 'chest_isolation'
  WHERE name IN ('ケーブルフライ', 'ペックデック',
                 'ケーブルフライ（上部）', 'ケーブルフライ（中部）', 'ケーブルフライ（下部）');

UPDATE exercise_master SET slot_type = 'shoulder_lateral_cable'
  WHERE name IN ('ケーブルサイドレイズ', 'マシンサイドレイズ');

UPDATE exercise_master SET slot_type = 'biceps_alt'
  WHERE name IN ('インクラインダンベルカール', 'ハンマーカール');

-- Day 4 ───────────────────────────────────
UPDATE exercise_master SET slot_type = 'hamstring_glute_heavy'
  WHERE name IN ('デッドリフト', 'ラックプル', 'スティッフレッグDL');

UPDATE exercise_master SET slot_type = 'quad_glute_secondary'
  WHERE name IN ('ハイバースクワット', 'フロントスクワット', 'ハックスクワット');

UPDATE exercise_master SET slot_type = 'calves_standing'
  WHERE name IN ('スタンディングカーフレイズ');

UPDATE exercise_master SET slot_type = 'core_alt'
  WHERE name IN ('レッグレイズ', 'クランチ');

-- triceps アームプレスダウン系 ──────────────
UPDATE exercise_master SET slot_type = 'triceps'
  WHERE name IN ('ケーブルプレスダウン');

-- 確認: slot_type が設定された件数
SELECT slot_type, COUNT(*) as cnt
FROM exercise_master
WHERE slot_type IS NOT NULL
GROUP BY slot_type
ORDER BY slot_type;
