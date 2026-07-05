-- ============================================================
-- movement_pattern の「タグ漏れ(NULL)」と「意図的に14パターン非該当」を区別する
-- ============================================================
-- add_movement_pattern_column.sql 実行後に判明した問題への追補。
-- これまでレッグカール等5種目はmovement_pattern=NULLのままにしていたが、
-- これだと「タグを付け忘れた種目」と「意図的にどのパターンにも該当しない種目」が
-- 区別できず、漏れ検出クエリ（WHERE movement_pattern IS NULL）が毎回両方を
-- 混在して返してしまう。後者には明示的な値を入れ、NULLは純粋な「未タグ」だけを
-- 意味するようにする。
--
-- 実行順序: add_movement_pattern_column.sql → add_hip_adduction_slot.sql → このファイル
-- （このファイルは既存のCHECK制約を一度DROPしてから追加値を含めて再作成する）

ALTER TABLE exercise_master DROP CONSTRAINT IF EXISTS exercise_master_movement_pattern_check;

ALTER TABLE exercise_master ADD CONSTRAINT exercise_master_movement_pattern_check
  CHECK (movement_pattern IN (
    -- 24スロットのプログラム生成（generate_program_slots.ts）で使う14パターン
    'horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull', 'squat', 'hip_hinge',
    'shoulder_horizontal_adduction', 'shoulder_abduction', 'shoulder_horizontal_abduction',
    'elbow_flexion', 'elbow_extension', 'ankle_plantar_flexion', 'trunk_flexion', 'hip_adduction_abduction',
    -- 上記14パターンには該当しないが、動作は明確に分類できる種目用（プログラム生成では未使用、
    -- 一般カタログの分類情報としてのみ保持する）
    'knee_flexion', 'knee_extension', 'shoulder_flexion', 'shoulder_elevation'
  ));

UPDATE exercise_master SET movement_pattern = 'knee_flexion'
WHERE name IN ('レッグカール', 'シーテッドレッグカール');

UPDATE exercise_master SET movement_pattern = 'knee_extension'
WHERE name IN ('レッグエクステンション');

UPDATE exercise_master SET movement_pattern = 'shoulder_flexion'
WHERE name IN ('フロントレイズ');

UPDATE exercise_master SET movement_pattern = 'shoulder_elevation'
WHERE name IN ('アップライトロウ');

-- 確認: movement_pattern IS NULL は「純粋な未タグ」のみを意味するようになったはず
-- （0件になっていれば、既知の全種目にタグ付けが完了している）
SELECT id, name, slot_type, target_muscle
FROM exercise_master
WHERE movement_pattern IS NULL
ORDER BY target_muscle, name;

-- 確認: 14パターン非該当の明示タグが正しく付いていること
SELECT name, movement_pattern FROM exercise_master
WHERE movement_pattern IN ('knee_flexion', 'knee_extension', 'shoulder_flexion', 'shoulder_elevation')
ORDER BY movement_pattern, name;
