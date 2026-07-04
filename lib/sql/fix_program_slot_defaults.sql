-- ============================================================
-- プログラムスロットのデフォルト種目をシート（UpperLowerBodyhypertrophy9weeks_sheet.xlsx）通りに修正
-- ============================================================
-- 背景: 過去のマイグレーションで
--   1) 'ブルガリアンスクワット' という誤名（正しくは「ブルガリアンスプリットスクワット」）で
--      UPDATE を実行したため一致せず、quad_ham_glute 枠は「ランジ」のみがタグ付けされていた
--   2) チェストサポーテッドロウ/ライイングトライセプスEX/ナローベンチプレス/ワンハンドロウ/
--      ハイバースクワットがそもそも exercise_master に未登録だった
--   3) 懸垂が back_vertical_pull（Day1）に統合され、back_vertical_pull_alt（Day3）が空になっていた
--   4) biceps / biceps_alt はシート指定と異なる種目がデフォルトになっていた（順序起因）
-- 既存の user_slot_assignments・training_sets は exercise_id 参照のため、本修正による影響はない。

-- 1) ブルガリアンスプリットスクワットを quad_ham_glute に正しくタグ付け（ランジはそのまま代替として残す）
UPDATE exercise_master
SET slot_type = 'quad_ham_glute'
WHERE name = 'ブルガリアンスプリットスクワット';

-- 2) 懸垂を back_vertical_pull_alt（Day3）へ移動。back_vertical_pull（Day1）はラットプルダウンのみに戻す
UPDATE exercise_master
SET slot_type = 'back_vertical_pull_alt'
WHERE name = '懸垂' AND slot_type = 'back_vertical_pull';

-- 3) 未登録だった5種目を追加
INSERT INTO exercise_master (name, target_muscle, sort_order, is_bodyweight, is_compound, slot_type)
SELECT name, target_muscle,
       (SELECT COALESCE(MAX(sort_order), 0) FROM exercise_master) + row_number() OVER () * 10,
       is_bodyweight, is_compound, slot_type
FROM (VALUES
  ('チェストサポーテッドロウ', 'back',  false, true,  'back_horizontal_pull'),
  ('ライイングトライセプスEX', 'arms',  false, false, 'triceps'),
  ('ナローベンチプレス',       'chest', false, true,  'chest_triceps_compound'),
  ('ワンハンドロウ',           'back',  false, true,  'back_horizontal_pull_heavy'),
  ('ハイバースクワット',       'legs',  false, true,  'quad_glute_secondary')
) AS t(name, target_muscle, is_bodyweight, is_compound, slot_type)
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_master WHERE exercise_master.name = t.name
);

-- 確認
SELECT slot_type, name, sort_order
FROM exercise_master
WHERE slot_type IN (
  'quad_ham_glute', 'back_vertical_pull', 'back_vertical_pull_alt',
  'back_horizontal_pull', 'triceps', 'chest_triceps_compound',
  'back_horizontal_pull_heavy', 'quad_glute_secondary'
)
ORDER BY slot_type, sort_order;

-- ============================================================
-- 追記（2026-07-04）: 「ブルガリアンスプリットスクワット」はその後、
-- 参照元シート表記に合わせて「ブルガリアンスクワット」に改名した。
-- 別途 rename SQL を実行済み（本ファイルの上記内容は実行当時の記録のため変更しない）。
-- ============================================================
