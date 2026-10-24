-- W8（MaxOut 前の回復週）の重いメイン種目のトップセットの努力度を下げる（2026-10-24 オーナー指示）。
--
-- W8 は重量（%1RM）を保ってセット数を減らす週（直後の MaxOut に向けた調整）だが、トップセットが
-- RPE 9（あと1回）のままで、中枢神経系の疲労を抜くという回復週の目的に合っていなかった。
-- 重量を保ったまま努力度だけ下げるため、トップセットの回数を2回減らし、RPE 7 にする。
-- Epley の式で見た余裕: 胸プレス 86%×2＝約2.9回、スクワット 84%×3＝約2.7回、
-- ヒップヒンジ 82%×4＝約2.6回、肩プレス 77%×5＝約4.0回（RPE 6〜7.5 相当）。
-- バックオフ（トップの91〜95%×元の回数×2セット）は余裕が約2.6〜4回あるため変えない。

begin;

update public.movement_pattern_weekly_params
set top_set_reps = greatest(1, top_set_reps - 2), top_set_rpe = 7.0
where week_number = 8 and phase = 'deload' and top_set_rpe > 8;

commit;
