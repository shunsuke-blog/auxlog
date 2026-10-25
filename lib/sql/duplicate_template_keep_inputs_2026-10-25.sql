-- テンプレートの複製で、作成時の条件（generation_inputs: 週の日数・時間・重点部位・対象・レベル）も
-- 引き継ぐ（2026-10-25、プログラム一覧に条件を表示するため）。以前の複製は条件が空になっていたので、
-- 複製元に条件があるものだけ、複製元からコピーする（作成元の条件そのものなので値の意味は変わらない）。

begin;

create or replace function public.duplicate_plan_template(p_plan_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_own_template(p_plan_id);
  v_name text := btrim(p_name);
  v_plan uuid;
  r_day record;
  r_ex record;
  v_day uuid;
  v_ex uuid;
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id, generation_inputs)
  select v_uid, null, v_name, total_weeks, 'draft', 'template', id, generation_inputs
  from coaching_plans where id = p_plan_id
  returning id into v_plan;

  for r_day in select * from plan_days where plan_id = p_plan_id loop
    insert into plan_days (plan_id, week_number, day_number, label)
    values (v_plan, r_day.week_number, r_day.day_number, r_day.label)
    returning id into v_day;

    for r_ex in select * from plan_exercises where plan_day_id = r_day.id loop
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, sort_order, note)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.sort_order, r_ex.note)
      returning id into v_ex;

      insert into plan_sets (plan_exercise_id, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, updated_by)
      select v_ex, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, v_uid
      from plan_sets where plan_exercise_id = r_ex.id;
    end loop;
  end loop;

  return v_plan;
end;
$$;

update public.coaching_plans c
set generation_inputs = o.generation_inputs
from public.coaching_plans o
where o.id = c.based_on_plan_id
  and c.link_id is null and c.source = 'template'
  and c.generation_inputs is null and o.generation_inputs is not null;

commit;
