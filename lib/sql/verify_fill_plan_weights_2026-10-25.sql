-- fill_plan_weights_from_record の確認（2026-10-25）。中身を含めて実行し、最後に ROLLBACK する。
begin;
-- 1RMを入力せずに共有したプランの重量を、トレーニーの初回の記録から自動で入れる（2026-10-25 オーナー決定）。
--
-- トレーナーがトレーニー追加時に1RMを空欄にした種目は、%1RM のセットの重量（target_weight_kg）が空のまま。
-- トレーニーがその種目を初めて記録したら、その記録のワーキングセットから1RMを推定し（Epley:
-- 重量×(1+回数/30)、1回なら重量そのもの。回数12回以下のセットだけ使う）、同じプランの同じ種目の
-- %1RM のセットで重量が空のものに、%×推定1RM（2.5kg単位）を入れる。
-- すでに重量が入っているセット（トレーナーが1RMを入れた・編集した）は変えない。
-- 記録の保存（/api/sessions）の後に呼ぶ。トレーニー本人の進行中のプランだけ（assert_trainee_plan_exercise）。


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

create temp table _ids on commit drop as
select (select id from public.users where is_admin order by created_at limit 1) as trainer,
  (select u.id from public.users u where not u.is_admin and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id) and not exists (select 1 from trainer_profiles p where p.user_id = u.id) order by u.created_at limit 1) as trainee,
  (select u.id from public.users u where not u.is_admin order by u.created_at desc limit 1) as other;
alter table _ids add column pe1 uuid, add column pe2 uuid, add column ue uuid;
do $$
declare v _ids%rowtype; l uuid; p uuid; d1 uuid; d2 uuid; e1 uuid; e2 uuid;
begin
  select * into v from _ids;
  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at) values (v.trainer, v.trainee, 'fill-test', 'active', now()) returning id into l;
  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, shared_at) values (v.trainer, l, 'fill', 2, 'shared', 'blank', now()) returning id into p;
  insert into plan_days (plan_id, week_number, day_number) values (p, 1, 1) returning id into d1;
  insert into plan_days (plan_id, week_number, day_number) values (p, 2, 1) returning id into d2;
  insert into plan_exercises (plan_day_id, exercise_master_id, sort_order) values (d1, (select id from exercise_master where code='barbell_bench_press'), 1) returning id into e1;
  insert into plan_exercises (plan_day_id, exercise_master_id, sort_order) values (d2, (select id from exercise_master where code='barbell_bench_press'), 1) returning id into e2;
  insert into plan_sets (plan_exercise_id, set_number, target_pct_1rm, target_reps) values (e1, 1, 0.8, 5), (e2, 1, 0.82, 5), (e2, 2, 0.75, 8);
  insert into plan_sets (plan_exercise_id, set_number, target_weight_kg, target_reps) values (e2, 3, 50, 10);
  update _ids set pe1 = e1, pe2 = e2;
end $$;
create temp table _r (test text, ok boolean) on commit drop;
grant select, update on _ids to authenticated; grant insert, select on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
update _ids set ue = public.ensure_plan_user_exercise(pe1);
insert into training_sessions (user_id, trained_at, fatigue_level, memo) select trainee, current_date, 3, 'fill-test' from _ids;
insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, plan_exercise_id)
select (select id from training_sessions where memo='fill-test' and user_id=(select trainee from _ids)), ue, 1, 80, 6, pe1 from _ids;
insert into _r select 'W01 重量が空の%セット3つが埋まる', public.fill_plan_weights_from_record((select pe1 from _ids)) = 3;
reset role;
-- 80kg×6回 → 1RM 96kg。W1: 0.8×96=76.8→77.5、W2: 0.82×96=78.72→77.5、0.75×96=72→72.5、kg指定の50は変えない
insert into _r select 'W02 W1 80% → 77.5kg', (select target_weight_kg from plan_sets where plan_exercise_id=(select pe1 from _ids) and set_number=1) = 77.5;
insert into _r select 'W03 W2 75% → 72.5kg', (select target_weight_kg from plan_sets where plan_exercise_id=(select pe2 from _ids) and set_number=2) = 72.5;
insert into _r select 'W04 kg指定のセットは変えない', (select target_weight_kg from plan_sets where plan_exercise_id=(select pe2 from _ids) and set_number=3) = 50;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'W05 2回目は何もしない', public.fill_plan_weights_from_record((select pe1 from _ids)) = 0;
select set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true) from _ids;
do $$ begin perform public.fill_plan_weights_from_record((select pe1 from _ids)); insert into _r values ('W06 第三者は呼べない', false);
exception when others then insert into _r values ('W06 第三者は呼べない', sqlstate = '42501'); end $$;
reset role;
select test, ok from _r order by test;
rollback;
