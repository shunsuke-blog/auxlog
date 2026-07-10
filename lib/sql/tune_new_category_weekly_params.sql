-- leg_default/triceps_2/back_3の週次パラメータチューニング（2026-07-10）。
-- 2026-07-08の新方式移行時、この3カテゴリは旧システムに存在しなかったため
-- 最も近い旧スロットのデータを複製してベースラインにしていた
-- （.company/engineering/docs/mesocycle-tier-progression-levers-design.md、
-- migrate_to_program_composition.sql参照）。実データを他の「2種目目/3種目目」系
-- カテゴリと突き合わせて比較した結果:
--
-- - leg_default: leg_2と全項目・全週が完全一致。両方とも同じ旧スロット
--   (quad_glute_secondary)を意図的に共有しているため問題なし。変更不要。
-- - triceps_2: 複製元がtriceps(三頭1種目目、強度寄りの進行)だったため、
--   他の「2種目目」系(biceps_2等)と違いレップ幅が週を追うごとに狭まる
--   （ボリューム漸増ではなく強度漸増）という逆方向の進行になっていた。
--   biceps_2と同じボリューム漸増パターンに揃える。
-- - back_3: back_2とほぼ完全一致だったが、9週目(MaxOut週)だけback_2は
--   NULL(全力AMRAP扱い)なのに実数値が残っていた（複製元back_vertical_pull_altの
--   名残）。back_2に合わせてNULLにする。

-- ── triceps_2: biceps_2と同じボリューム漸増パターンに更新（week1は既に一致のため対象外） ──
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 10, rep_range_max = 14, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 2;
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 10, rep_range_max = 14, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 3;
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 12, rep_range_max = 14, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 4;
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 14, rep_range_max = 16, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 5;
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 14, rep_range_max = 20, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 6;
UPDATE program_weekly_params SET working_sets = 3, rep_range_min = 14, rep_range_max = 20, rpe = 9.0
  WHERE slot_id = 'triceps_2' AND week_number = 7;
UPDATE program_weekly_params SET working_sets = 2, rep_range_min = 15, rep_range_max = 20, rpe = 10.0
  WHERE slot_id = 'triceps_2' AND week_number = 8;

-- ── back_3: 9週目をback_2と同じNULLに揃える ──
UPDATE program_weekly_params SET working_sets = NULL, rep_range_min = NULL, rep_range_max = NULL, rpe = NULL
  WHERE slot_id = 'back_3' AND week_number = 9;

-- leg_defaultは変更なし（意図的にleg_2と同一のため）
