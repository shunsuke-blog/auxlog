-- W8（MaxOut 前の回復週）の補助種目の設定値を、回復週として正しい値に直す（2026-10-24 オーナー指示）。
--
-- 問題: W8 の program_weekly_params の多くが RPE 9〜10（RIR 0〜1、限界まで追い込む）になっており、
-- W1〜W7 の疲労を抜いて W9 の MaxOut で力を出し切るという回復週の目的と逆だった。
-- 対応:
--   1. W8 で RPE が 8 を超える行を RPE 7.5（RIR 2〜3）にする（推奨 RPE 7〜8 の中央）
--   2. W8 のセット数が W7 と同じ（減っていない）行は、W7 より1セット減らす（肩の横・後部の4行）
-- 回数の範囲は変えない。1RM管理の種目（movement_pattern_weekly_params）は対象外。
-- セルフモードの W8 の提案（重点部位の補助種目）にも反映される。

begin;

update public.program_weekly_params w8
set working_sets = w7.working_sets - 1
from public.program_weekly_params w7
where w8.week_number = 8 and w7.week_number = 7
  and w7.program_id = w8.program_id and w7.slot_id = w8.slot_id
  and w8.working_sets is not null and w7.working_sets is not null
  and w8.working_sets >= w7.working_sets;

update public.program_weekly_params
set rpe = 7.5
where week_number = 8 and rpe > 8;

commit;
