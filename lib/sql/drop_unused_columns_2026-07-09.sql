-- 2026-07-09コードレビューで確認した不要カラムの削除ドラフト。
--
-- 【重要】実行前に必ず以下を確認すること:
--   1. 対象カラムの実データをダンプし、本当に全行NULL/デフォルト値のままか確認する
--      （feedback_sql_verify_against_real_data: WHERE句と同様、コードでの参照有無だけでは
--      見落とす可能性があるため）
--   2. 管理画面・スクリプト等、今回のgrep対象(app/, lib/, components/)に含まれない
--      場所で参照されていないか再確認する
--   3. バックアップ（Supabaseのポイントインタイムリカバリ等）が有効なことを確認する
--   4. 破壊的操作のため、実行は一括ではなく1文ずつ確認しながら行うことを推奨する
--
-- 根拠: .company/engineering/docs/code-review-2026-07-08.md の「DBの不要カラム・テーブル」表

-- exercise_master.slot_type: 旧システムの名残。2026-07-08のマイグレーションコメントで
-- 「今のロジックでは未使用」と明記済み。movement_pattern/target_muscleに置き換え済み。
ALTER TABLE exercise_master DROP COLUMN IF EXISTS slot_type;

-- program_slots.priority: migrate_to_program_composition.sqlのコメントで
-- 「NOT NULLのプレースホルダ、正はprogram_composition.ts」と明記済み。
ALTER TABLE program_slots DROP COLUMN IF EXISTS priority;

-- program_slots.day_number: 同上。日別配分は現在generate_program_composition.tsの
-- distributeToDays()が担っており、DBのday_numberは参照されていない
-- （user_program_day_extras.day_numberとは別カラムなので混同注意）。
ALTER TABLE program_slots DROP COLUMN IF EXISTS day_number;

-- program_slots.is_compound: コード上、この意味での参照はexercise_master/user_exercises
-- 側のis_compoundのみで、program_slots.is_compoundはどこからも読まれていない。
ALTER TABLE program_slots DROP COLUMN IF EXISTS is_compound;

-- program_slots.has_one_rm: 1RM管理の要否は現在exercise_master.requires_one_rm
-- （種目単位）で判定しており、program_slots.has_one_rmは参照されていない。
ALTER TABLE program_slots DROP COLUMN IF EXISTS has_one_rm;

-- user_program_enrollments.completed_at: is_activeのみでエンロール状態を判定しており、
-- completed_atはコード上どこからも読み書きされていない。
ALTER TABLE user_program_enrollments DROP COLUMN IF EXISTS completed_at;

-- ── 今回は見送り ──
-- programsテーブル: name/total_weeks/days_per_weekカラムはコード上未参照だが、
-- program_slots.program_id / program_weekly_params.program_idの参照先(FK)として
-- テーブル自体は構造上必要。カラム単位の削除は追加のFK・依存関係調査が必要なため、
-- 今回のドラフトには含めない。
