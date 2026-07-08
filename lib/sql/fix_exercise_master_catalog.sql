-- exercise_masterの実データとprogram-slots-tier-matrix.tsv(正)のズレを修正する。
-- 67件全件をslot_type(旧システムの名残列。今は未使用だがどの種目がどの旧カテゴリに
-- 対応するか特定するのに使える)で突き合わせた結果、TSVで正しいとされる種目名・tier・
-- 1RM管理と実DBが多数箇所で一致していないことが判明（2026-07-08、オーナー確認:
-- 「DBの方が間違っているからDBの方を修正・追加して」）。
-- tier3以上（オンボーディングのチェックリストに出ない）の細かいズレは対象外とし、
-- tier1/2（実際に表示される範囲）に絞って修正・追加する。

-- ── リネーム: slot_typeで「quad_glute_primary」と特定できる行がTSVでは
--    「ローバースクワット」のはずなのに、DBでは汎用的な「スクワット」のままだった ──
UPDATE exercise_master SET name = 'ローバースクワット' WHERE name = 'スクワット' AND slot_type = 'quad_glute_primary';

-- ── 1RM管理フラグの修正: 旧SQLが実際のDB表記と異なる名前(バーベルベンチプレス等)を
--    指定していたため反映されていなかった分を再設定 ──
UPDATE exercise_master SET requires_one_rm = TRUE WHERE name = 'ベンチプレス';
UPDATE exercise_master SET requires_one_rm = TRUE WHERE name = 'ローバースクワット';
UPDATE exercise_master SET requires_one_rm = TRUE WHERE name = 'ハックスクワット';

-- ── tier修正: DB側の名前は実質TSVと同じ種目だが、SQLの名前不一致でtier=3の
--    キャッチオール既定値に落ちてしまっていた分を正しいtierに戻す ──
UPDATE exercise_master SET tier = 2 WHERE name = 'プッシュアップ';        -- TSV「腕立て伏せ」相当
UPDATE exercise_master SET tier = 1 WHERE name = 'レッグエクステンション'; -- TSV「レッグEX」相当
UPDATE exercise_master SET tier = 2 WHERE name = 'プリーチャーカール';    -- TSV「プリチャーカール」相当（長音表記違い）
UPDATE exercise_master SET tier = 1 WHERE name = 'ペックデックフライ';    -- TSV「ペックフライマシン」相当
UPDATE exercise_master SET tier = 1 WHERE name = 'シーテッドケーブルロウ'; -- TSV「ケーブルロウロウ」相当

-- ── 新規追加: TSVにtier1/2として載っているが実DBに存在しない種目 ──
INSERT INTO exercise_master (name, target_muscle, movement_pattern, tier, requires_one_rm, is_compound, is_bodyweight, intensity_technique, sort_order)
VALUES
  ('インクラインダンベルプレス', 'chest',     'horizontal_press',              1, TRUE,  TRUE,  FALSE, 'none', 500),
  ('チェストプレス',           'chest',     'horizontal_press',              1, FALSE, FALSE, FALSE, 'none', 501),
  ('ワンハンドケーブルフライ',      'chest',     'shoulder_horizontal_adduction', 1, FALSE, FALSE, FALSE, 'none', 502),
  ('バイキングプレス',          'shoulders', 'vertical_press',                1, FALSE, FALSE, FALSE, 'none', 503),
  ('シーテッドバーベルショルダープレス', 'shoulders', 'vertical_press',                2, FALSE, FALSE, FALSE, 'none', 504),
  ('マシンショルダープレス',       'shoulders', 'vertical_press',                2, FALSE, FALSE, FALSE, 'none', 505),
  ('リバースペックフライ',        'shoulders', 'shoulder_horizontal_abduction', 1, FALSE, FALSE, FALSE, 'none', 506),
  ('インクラインサイドレイズ',      'shoulders', 'shoulder_abduction',            1, FALSE, FALSE, FALSE, 'none', 507),
  ('EZバーカール',            'arms',      'elbow_flexion',                 1, FALSE, FALSE, FALSE, 'none', 508),
  ('プリチャーハンマーカール',      'arms',      'elbow_flexion',                 1, FALSE, FALSE, FALSE, 'none', 509),
  ('ベイジアンカール',          'arms',      'elbow_flexion',                 2, FALSE, FALSE, FALSE, 'none', 510),
  ('膝ケーブルプリチャーカール',     'arms',      'elbow_flexion',                 1, FALSE, FALSE, FALSE, 'none', 511),
  ('ケーブルオーバーヘッドEX',     'arms',      'elbow_extension',               1, FALSE, FALSE, FALSE, 'none', 512),
  ('ケーブルニーリングオーバーEX',   'arms',      'elbow_extension',               1, FALSE, FALSE, FALSE, 'none', 513),
  ('ケーブルクランチ',          'core',      'trunk_flexion',                 1, FALSE, FALSE, FALSE, 'none', 514);
