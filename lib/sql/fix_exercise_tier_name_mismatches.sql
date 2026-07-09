-- add_exercise_tier.sql の一部のWHERE句が、実DBの種目名と一致しておらず
-- 空振りしていたため、本来tier1/2であるべき種目がキャッチオール(tier=3)に落ちて
-- オンボーディングの選択肢(tier<=2フィルタ)から消えていた。実データを
-- exercise_masterから全件ダンプして名前を突き合わせ、6件のズレを特定した
-- （2026-07-10、「sort_orderがtierの代わりにデフォルト選定を決めてしまっている」
-- バグの調査中に発見）。
--
-- 実行前に一度SELECTで対象行を確認することを推奨:
--   SELECT name, tier FROM exercise_master WHERE name IN
--     ('ベンチプレス','ペックデックフライ','プッシュアップ','シーテッドケーブルロウ',
--      'プリーチャーカール','レッグエクステンション');

UPDATE exercise_master SET tier = 1 WHERE name = 'ベンチプレス';              -- 旧WHERE句: 'バーベルベンチプレス'（DB未リネーム）
UPDATE exercise_master SET tier = 1 WHERE name = 'ペックデックフライ';         -- 旧WHERE句: 'ペックフライマシン'
UPDATE exercise_master SET tier = 2 WHERE name = 'プッシュアップ';            -- 旧WHERE句: '腕立て伏せ'
UPDATE exercise_master SET tier = 1 WHERE name = 'シーテッドケーブルロウ';       -- 旧WHERE句: 'ケーブルロウロウ'
UPDATE exercise_master SET tier = 2 WHERE name = 'プリーチャーカール';         -- 旧WHERE句: 'プリチャーカール'（長音記号の有無）
UPDATE exercise_master SET tier = 1 WHERE name = 'レッグエクステンション';       -- 旧WHERE句: 'レッグEX'
