-- ============================================================
-- exercise_master.movement_pattern を追加し、既存種目にタグ付けする
-- ============================================================
-- 部位×動きパターンベースのプログラム再設計（program_slots.ts）に伴う移行。
-- 実行順序: このファイル → add_hip_adduction_slot.sql
--
-- 実行前に本番の exercise_master を確認済み（2026-07-06時点、anon keyで直接クエリ）。
-- slot_type が既に設定されている種目は、program_slots.ts の movement_pattern マッピングを
-- そのまま踏襲する（レッグカールのみ例外、下記参照）。

ALTER TABLE exercise_master ADD COLUMN IF NOT EXISTS movement_pattern TEXT
  CHECK (movement_pattern IN (
    'horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull', 'squat', 'hip_hinge',
    'shoulder_horizontal_adduction', 'shoulder_abduction', 'shoulder_horizontal_abduction',
    'elbow_flexion', 'elbow_extension', 'ankle_plantar_flexion', 'trunk_flexion', 'hip_adduction_abduction'
  ));

-- ── slot_type が設定済みの種目: slot_typeベースで一括タグ付け ──
-- （レッグカールのみ除外。slot_type='hamstring_glute'だが、実際の動作は膝関節屈曲であり
-- 　ヒップヒンジ系の複合種目とは動作パターンが異なるため、下のNULL確認対象に残す）
UPDATE exercise_master em
SET movement_pattern = mapping.movement_pattern
FROM (VALUES
  ('chest_compound', 'horizontal_press'),
  ('chest_triceps_compound', 'horizontal_press'),
  ('chest_isolation', 'shoulder_horizontal_adduction'),
  ('back_horizontal_pull', 'horizontal_pull'),
  ('back_vertical_pull', 'vertical_pull'),
  ('back_horizontal_pull_heavy', 'horizontal_pull'),
  ('back_vertical_pull_alt', 'vertical_pull'),
  ('shoulder_vertical_press', 'vertical_press'),
  ('shoulder_lateral', 'shoulder_abduction'),
  ('shoulder_rear_delt', 'shoulder_horizontal_abduction'),
  ('shoulder_lateral_cable', 'shoulder_abduction'),
  ('biceps', 'elbow_flexion'),
  ('triceps', 'elbow_extension'),
  ('biceps_alt', 'elbow_flexion'),
  ('quad_glute_primary', 'squat'),
  ('hamstring_glute', 'hip_hinge'),
  ('calves_seated', 'ankle_plantar_flexion'),
  ('hamstring_glute_heavy', 'hip_hinge'),
  ('quad_glute_secondary', 'squat'),
  ('calves_standing', 'ankle_plantar_flexion'),
  ('quad_ham_glute', 'squat'),
  ('core', 'trunk_flexion'),
  ('core_alt', 'trunk_flexion')
) AS mapping(slot_type, movement_pattern)
WHERE em.slot_type = mapping.slot_type
  AND em.name <> 'レッグカール';

-- ── slot_type未設定（一般カタログ種目）: 種目名から明確に判定できるもののみタグ付け ──
UPDATE exercise_master em SET movement_pattern = t.movement_pattern
FROM (VALUES
  ('ダンベルフライ', 'shoulder_horizontal_adduction'),
  ('デクラインベンチプレス', 'horizontal_press'),
  ('ケーブルクロスオーバー', 'shoulder_horizontal_adduction'),
  ('ペックデックフライ', 'shoulder_horizontal_adduction'),
  ('プッシュアップ', 'horizontal_press'),
  ('シーテッドケーブルロウ', 'horizontal_pull'),
  ('ダンベルロウ', 'horizontal_pull'),
  ('Tバーロウ', 'horizontal_pull'),
  ('ストレートアームプルダウン', 'vertical_pull'),
  ('デッドリフト（スモウ）', 'hip_hinge'),
  ('カーフレイズ', 'ankle_plantar_flexion'),
  ('レッグプレス（ナロウ）', 'squat'),
  ('アーノルドプレス', 'vertical_press'),
  ('リアデルトフライ', 'shoulder_horizontal_abduction'),
  ('プリーチャーカール', 'elbow_flexion'),
  ('ケーブルカール', 'elbow_flexion'),
  ('スカルクラッシャー', 'elbow_extension'),
  ('トライセプスオーバーヘッドエクステンション', 'elbow_extension'),
  ('クローズグリップベンチプレス', 'horizontal_press'),
  ('ケーブルトライセプスエクステンション', 'elbow_extension'),
  ('ヒップアブダクション', 'hip_adduction_abduction'),
  ('ヒップアダクション', 'hip_adduction_abduction')
) AS t(name, movement_pattern)
WHERE em.name = t.name;

-- ── 意図的に未分類のまま残す種目（本設計の14パターンに厳密には該当しないため） ──
-- レッグカール／シーテッドレッグカール: 膝関節屈曲が主動作で、ヒップヒンジ系複合種目とは異なる
-- レッグエクステンション: 膝関節伸展の単関節種目で、スクワット系複合種目とは異なる
-- フロントレイズ: 肩関節屈曲で、本設計の肩関節外転（サイドレイズ）パターンとは異なる
-- アップライトロウ: 複合的な動作でどのパターンにも明確に該当しない
-- 上記は movement_pattern = NULL のまま。将来的にパターンを追加する場合に再検討する。

-- 確認: movement_pattern が未設定のまま残っている種目（意図した除外か、タグ漏れかを目視確認）
SELECT id, name, slot_type, target_muscle
FROM exercise_master
WHERE movement_pattern IS NULL
ORDER BY target_muscle, name;

-- 確認: パターンごとの件数
SELECT movement_pattern, COUNT(*) AS cnt
FROM exercise_master
WHERE movement_pattern IS NOT NULL
GROUP BY movement_pattern
ORDER BY movement_pattern;
