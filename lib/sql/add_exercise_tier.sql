-- exercise_master に種目ごとの「tier」列を追加する。
-- tier=1が最もデフォルト推奨、数字が大きいほどマイナー・バリエーション的な種目
-- （.company/engineering/docs/program-slots-tier-matrix.tsv のtier列がソース）。
-- オンボーディングの種目選択チェックリストをtier<=2に絞り込むために使う
-- （2026-07-08、program-composition-redesign-brainstorm.md 実機確認フィードバック対応）。

ALTER TABLE exercise_master ADD COLUMN IF NOT EXISTS tier INTEGER;

UPDATE exercise_master SET tier = 1 WHERE name = 'バーベルベンチプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'ダンベルベンチプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'インクラインベンチプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'インクラインダンベルプレス';
UPDATE exercise_master SET tier = 5 WHERE name = 'クロスボディスタンディングダンベルフライ';
UPDATE exercise_master SET tier = 3 WHERE name = 'デクラインプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'ディップス';
UPDATE exercise_master SET tier = 1 WHERE name = 'チェストプレス';
UPDATE exercise_master SET tier = 6 WHERE name = 'ヘックスプレス';
UPDATE exercise_master SET tier = 6 WHERE name = 'プレートプレス';
UPDATE exercise_master SET tier = 6 WHERE name = 'ランドマインインクラインプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルフライ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ワンハンドケーブルフライ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ペックフライマシン';
UPDATE exercise_master SET tier = 2 WHERE name = '腕立て伏せ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ダンベルフライ';
UPDATE exercise_master SET tier = 3 WHERE name = 'ナローベンチプレス';
UPDATE exercise_master SET tier = 3 WHERE name = 'ケーブルフライ（下部）';
UPDATE exercise_master SET tier = 3 WHERE name = 'ケーブルフライ（上部）';
UPDATE exercise_master SET tier = 3 WHERE name = 'ケーブルフライ（中部）';
UPDATE exercise_master SET tier = 1 WHERE name = '懸垂';
UPDATE exercise_master SET tier = 1 WHERE name = 'ラットプルダウン';
UPDATE exercise_master SET tier = 1 WHERE name = 'ワンハンドロウ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ベントオーバーロウ';
UPDATE exercise_master SET tier = 3 WHERE name = 'スタンディングダンベルロウ';
UPDATE exercise_master SET tier = 1 WHERE name = 'チェストサポーテッドロウ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルロウロウ';
UPDATE exercise_master SET tier = 4 WHERE name = 'メドウズロウ';  
UPDATE exercise_master SET tier = 2 WHERE name = 'ケーブルプルオーバー';
UPDATE exercise_master SET tier = 2 WHERE name = 'ダンベルショルダープレス';
UPDATE exercise_master SET tier = 2 WHERE name = 'オーバーヘッドプレス';
UPDATE exercise_master SET tier = 2 WHERE name = 'シーテッドバーベルショルダープレス';
UPDATE exercise_master SET tier = 4 WHERE name = 'バックプレス';
UPDATE exercise_master SET tier = 2 WHERE name = 'マシンショルダープレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'バイキングプレス';
UPDATE exercise_master SET tier = 4 WHERE name = 'フロントレイズ';
UPDATE exercise_master SET tier = 2 WHERE name = 'サイドレイズ';
UPDATE exercise_master SET tier = 1 WHERE name = 'インクラインサイドレイズ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルサイドレイズ';
UPDATE exercise_master SET tier = 3 WHERE name = 'アップライトロウ';
UPDATE exercise_master SET tier = 3 WHERE name = 'リアデルトフライ';
UPDATE exercise_master SET tier = 2 WHERE name = 'ライイングリアダンベルフライ';
UPDATE exercise_master SET tier = 1 WHERE name = 'リバースペックフライ';
UPDATE exercise_master SET tier = 3 WHERE name = 'アーノルドプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'フェイスプル';
UPDATE exercise_master SET tier = 1 WHERE name = 'バーベルカール';
UPDATE exercise_master SET tier = 1 WHERE name = 'EZバーカール';
UPDATE exercise_master SET tier = 2 WHERE name = 'ケーブルカール';
UPDATE exercise_master SET tier = 2 WHERE name = 'ダンベルカール';
UPDATE exercise_master SET tier = 2 WHERE name = 'ハンマーカール';
UPDATE exercise_master SET tier = 2 WHERE name = 'プリチャーカール';
UPDATE exercise_master SET tier = 1 WHERE name = 'プリチャーハンマーカール';
UPDATE exercise_master SET tier = 1 WHERE name = 'インクラインダンベルカール';
UPDATE exercise_master SET tier = 2 WHERE name = 'ベイジアンカール';
UPDATE exercise_master SET tier = 1 WHERE name = '膝ケーブルプリチャーカール';
UPDATE exercise_master SET tier = 1 WHERE name = 'ライイングトライセプスEX';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルオーバーヘッドEX';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルニーリングオーバーEX';
UPDATE exercise_master SET tier = 2 WHERE name = 'ダンベルフレンチプレス';
UPDATE exercise_master SET tier = 4 WHERE name = 'ベンチディップス';
UPDATE exercise_master SET tier = 4 WHERE name = 'キックバック';
UPDATE exercise_master SET tier = 1 WHERE name = 'トライセプスプレスダウン';
UPDATE exercise_master SET tier = 1 WHERE name = 'レッグEX';
UPDATE exercise_master SET tier = 1 WHERE name = 'ハックスクワット';
UPDATE exercise_master SET tier = 1 WHERE name = 'ハイバースクワット';
UPDATE exercise_master SET tier = 1 WHERE name = 'ローバースクワット';
UPDATE exercise_master SET tier = 3 WHERE name = 'フロントスクワット';
UPDATE exercise_master SET tier = 1 WHERE name = 'ブルガリアンスクワット';
UPDATE exercise_master SET tier = 3 WHERE name = 'ランジ';
UPDATE exercise_master SET tier = 2 WHERE name = 'レッグプレス';
UPDATE exercise_master SET tier = 1 WHERE name = 'デッドリフト';
UPDATE exercise_master SET tier = 2 WHERE name = 'ルーマニアンデッドリフト';
UPDATE exercise_master SET tier = 2 WHERE name = 'ヒップスラスト';
UPDATE exercise_master SET tier = 3 WHERE name = 'レッグカール';
UPDATE exercise_master SET tier = 3 WHERE name = 'ヒップアブダクション';
UPDATE exercise_master SET tier = 3 WHERE name = 'ヒップアダクション';
UPDATE exercise_master SET tier = 2 WHERE name = 'シーテッドカーフレイズ';
UPDATE exercise_master SET tier = 2 WHERE name = 'スタンディングカーフレイズ';
UPDATE exercise_master SET tier = 6 WHERE name = 'プランク';
UPDATE exercise_master SET tier = 1 WHERE name = 'アブローラー';
UPDATE exercise_master SET tier = 2 WHERE name = 'クランチ';
UPDATE exercise_master SET tier = 1 WHERE name = 'ケーブルクランチ';
UPDATE exercise_master SET tier = 2 WHERE name = 'レッグレイズ';
UPDATE exercise_master SET tier = 3 WHERE name = 'ハンギングニーレイズ';

-- tierが未設定（TSVに載っていない・上記UPDATEで拾えなかった）種目は3扱いにして
-- オンボーディングのtier<=2フィルタから安全に除外する
UPDATE exercise_master SET tier = 3 WHERE tier IS NULL;
