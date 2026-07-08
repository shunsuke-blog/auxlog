-- exercise_master に種目ごとの「1RM管理が必要か」フラグを追加する。
-- 動きパターン単位のカテゴリ(program_composition.ts)には、同じパターンでも1RM管理する
-- 重いコンパウンド種目(例: デッドリフト)と、しない軽めのバリエーション(例:
-- ルーマニアンデッドリフト)が混在するため、カテゴリ単位のhasOneRmだけでは判定を誤る
-- （2026-07-08、実機確認フィードバック対応。program-slots-tier-matrix.tsvの
-- 「1RM管理」列が種目ごとの正しいソース）。

ALTER TABLE exercise_master ADD COLUMN IF NOT EXISTS requires_one_rm BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE exercise_master SET requires_one_rm = TRUE WHERE name IN (
  'バーベルベンチプレス',
  'ダンベルベンチプレス',
  'インクラインベンチプレス',
  'インクラインダンベルプレス',
  'ディップス',
  'ナローベンチプレス',
  'ダンベルショルダープレス',
  'オーバーヘッドプレス',
  'ハックスクワット',
  'ハイバースクワット',
  'ローバースクワット',
  'レッグプレス',
  'デッドリフト'
);
