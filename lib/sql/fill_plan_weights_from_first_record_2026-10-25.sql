-- 1RMを入力せずに共有したプランの重量を、トレーニーの初回の記録から自動で入れる（2026-10-25 オーナー決定）。
--
-- トレーナーがトレーニー追加時に1RMを空欄にした種目は、%1RM のセットの重量（target_weight_kg）が空のまま。
-- トレーニーがその種目を初めて記録したら、その記録のワーキングセットから1RMを推定し（Epley:
-- 重量×(1+回数/30)、1回なら重量そのもの。回数12回以下のセットだけ使う）、同じプランの同じ種目の
-- %1RM のセットで重量が空のものに、%×推定1RM（2.5kg単位）を入れる。
-- すでに重量が入っているセット（トレーナーが1RMを入れた・編集した）は変えない。
-- 記録の保存（/api/sessions）の後に呼ぶ。トレーニー本人の進行中のプランだけ（assert_trainee_plan_exercise）。

begin;

create or replace function public.fill_plan_weights_from_record(p_plan_exercise_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_plan uuid;
  v_one_rm numeric;
  v_count int;
begin
  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  select d.plan_id into v_plan from plan_days d where d.id = v_pe.plan_day_id;

  -- このプランの同じ種目に、重量が空の %1RM のセットが無ければ何もしない
  if not exists (
    select 1 from plan_sets s
    join plan_exercises pe on pe.id = s.plan_exercise_id
    join plan_days d on d.id = pe.plan_day_id
    where d.plan_id = v_plan
      and pe.exercise_master_id is not distinct from v_pe.exercise_master_id
      and pe.trainer_exercise_id is not distinct from v_pe.trainer_exercise_id
      and s.target_pct_1rm is not null and s.target_weight_kg is null
  ) then
    return 0;
  end if;

  select max(case when t.reps <= 1 then t.weight_kg else t.weight_kg * (1 + t.reps / 30.0) end)
  into v_one_rm
  from training_sets t
  join training_sessions ss on ss.id = t.session_id
  where t.plan_exercise_id = p_plan_exercise_id
    and ss.user_id = v_uid
    and not t.is_warmup
    and t.weight_kg > 0
    and t.reps between 1 and 12;

  if v_one_rm is null then
    return 0;
  end if;

  update plan_sets s
  set target_weight_kg = round(s.target_pct_1rm * v_one_rm / 2.5) * 2.5, updated_at = now()
  from plan_exercises pe, plan_days d
  where pe.id = s.plan_exercise_id and d.id = pe.plan_day_id
    and d.plan_id = v_plan
    and pe.exercise_master_id is not distinct from v_pe.exercise_master_id
    and pe.trainer_exercise_id is not distinct from v_pe.trainer_exercise_id
    and s.target_pct_1rm is not null and s.target_weight_kg is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.fill_plan_weights_from_record(uuid) from public, anon;
grant execute on function public.fill_plan_weights_from_record(uuid) to authenticated;

commit;
