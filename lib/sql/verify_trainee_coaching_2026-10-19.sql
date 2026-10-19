-- トレーニー側コーチングモードのRPC・トリガーの確認（2026-10-19）
-- trainee_coaching_2026-10-19.sql の中身を含めて実行し、最後に ROLLBACK するので本番データは変わらない。
begin;
-- トレーニー側のコーチングモード（ロードマップ⑤、2026-10-19）
--
-- 決定事項（要件定義）:
--   - プランの種目（exercise_master / trainer_exercises）は、トレーニーが初めて記録する時に
--     トレーニーの user_exercises へコピーする。契約が終わってもトレーニー側に種目名が残る
--   - 記録は training_sets.plan_exercise_id で種目単位にプランと紐付ける
--   - 種目を飛ばしたことは plan_exercise_skips に残す（記録しないと「やらなかった」と区別できない）
--   - プランは最初の記録で開始（shared → active）
--   - 週はトレーニーが「次の週へ」で進める（セルフモードと同じ）
-- 書き込みはすべて SECURITY DEFINER の RPC で、契約中のトレーニー本人かを関数内で確認する。


-- コピー元のトレーナー独自種目（同じ種目を2回コピーしないための照合用）
alter table public.user_exercises
  add column trainer_exercise_id uuid references public.trainer_exercises(id) on delete set null;
create unique index user_exercises_trainer_exercise_uniq
  on public.user_exercises (user_id, trainer_exercise_id) where trainer_exercise_id is not null;

-- ---------------------------------------------------------------------------
-- 共通: ログイン中のトレーニーが、この種目を含む進行中のプランの持ち主であること
-- ---------------------------------------------------------------------------

create or replace function public.assert_trainee_plan_exercise(p_plan_exercise_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1
    from plan_exercises pe
    join plan_days d on d.id = pe.plan_day_id
    join coaching_plans p on p.id = d.plan_id
    join trainer_trainee_links l on l.id = p.link_id
    where pe.id = p_plan_exercise_id
      and l.trainee_id = v_uid
      and l.status = 'active'
      and p.status in ('shared', 'active')
  ) then
    raise exception 'plan exercise not found' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 記録前: プランの種目に対応するトレーニーの user_exercises を用意して ID を返す
-- ---------------------------------------------------------------------------

create or replace function public.ensure_plan_user_exercise(p_plan_exercise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_te trainer_exercises%rowtype;
  v_ue uuid;
  v_sort int;
begin
  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  select coalesce(max(sort_order), 0) + 1 into v_sort from user_exercises where user_id = v_uid;

  if v_pe.exercise_master_id is not null then
    select id into v_ue from user_exercises
    where user_id = v_uid and exercise_master_id = v_pe.exercise_master_id
    order by is_active desc, created_at
    limit 1;
    if v_ue is null then
      insert into user_exercises (user_id, exercise_master_id, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound)
      select v_uid, m.id, 3, 10, v_sort, true, coalesce(m.is_bodyweight, false), m.is_compound
      from exercise_master m where m.id = v_pe.exercise_master_id
      returning id into v_ue;
    end if;
  else
    select * into v_te from trainer_exercises where id = v_pe.trainer_exercise_id;
    select id into v_ue from user_exercises
    where user_id = v_uid and trainer_exercise_id = v_te.id;
    if v_ue is null then
      insert into user_exercises (user_id, custom_name, custom_target_muscle, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound, trainer_exercise_id)
      values (v_uid, v_te.name, v_te.target_muscle, 3, 10, v_sort, true, v_te.is_bodyweight, v_te.is_compound, v_te.id)
      returning id into v_ue;
    end if;
  end if;

  update user_exercises set is_active = true where id = v_ue and not is_active;
  return v_ue;
end;
$$;

-- ---------------------------------------------------------------------------
-- 種目を飛ばす / 飛ばしたのを取り消す
-- ---------------------------------------------------------------------------

create or replace function public.skip_plan_exercise(p_plan_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
begin
  if exists (select 1 from training_sets where plan_exercise_id = p_plan_exercise_id) then
    raise exception 'already recorded' using errcode = 'P0001', hint = 'already_recorded';
  end if;
  insert into plan_exercise_skips (plan_exercise_id, trainee_id)
  values (p_plan_exercise_id, v_uid)
  on conflict (plan_exercise_id) do nothing;
end;
$$;

create or replace function public.unskip_plan_exercise(p_plan_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
begin
  delete from plan_exercise_skips where plan_exercise_id = p_plan_exercise_id and trainee_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 次の週へ進む（最終週より先には進めない。最終週の後はプランの終了で扱う）
-- ---------------------------------------------------------------------------

create or replace function public.advance_coaching_week()
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan coaching_plans%rowtype;
begin
  select p.* into v_plan
  from coaching_plans p
  join trainer_trainee_links l on l.id = p.link_id
  where l.trainee_id = v_uid and l.trainer_id <> v_uid and l.status = 'active'
    and p.status in ('shared', 'active')
  for update of p;
  if not found then
    raise exception 'no live plan' using errcode = '42501';
  end if;
  if v_plan.current_week >= v_plan.total_weeks then
    raise exception 'already final week' using errcode = 'P0001', hint = 'final_week';
  end if;

  update coaching_plans
  set current_week = current_week + 1, current_week_started_at = now(), updated_at = now()
  where id = v_plan.id;
  return v_plan.current_week + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 記録の検証トリガーに「最初の記録でプランを開始する」を加える
-- ---------------------------------------------------------------------------

create or replace function public.check_training_set_plan_exercise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan uuid;
begin
  if new.plan_exercise_id is null then
    return new;
  end if;
  select p.id into v_plan
  from training_sessions s
  join plan_exercises pe on pe.id = new.plan_exercise_id
  join plan_days d on d.id = pe.plan_day_id
  join coaching_plans p on p.id = d.plan_id
  join trainer_trainee_links l on l.id = p.link_id
  where s.id = new.session_id
    and l.trainee_id = s.user_id
    and l.status = 'active'
    and p.status in ('shared', 'active');
  if v_plan is null then
    raise exception 'plan_exercise_id % is not part of an active plan for this trainee', new.plan_exercise_id
      using errcode = '42501';
  end if;

  update coaching_plans
  set status = 'active', started_at = now(), current_week_started_at = coalesce(current_week_started_at, now()), updated_at = now()
  where id = v_plan and status = 'shared';
  -- 記録したら「飛ばした」は取り消す
  delete from plan_exercise_skips where plan_exercise_id = new.plan_exercise_id;
  return new;
end;
$$;

revoke execute on function public.assert_trainee_plan_exercise(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_plan_user_exercise(uuid) from public, anon;
revoke execute on function public.skip_plan_exercise(uuid) from public, anon;
revoke execute on function public.unskip_plan_exercise(uuid) from public, anon;
revoke execute on function public.advance_coaching_week() from public, anon;
grant execute on function public.ensure_plan_user_exercise(uuid) to authenticated;
grant execute on function public.skip_plan_exercise(uuid) to authenticated;
grant execute on function public.unskip_plan_exercise(uuid) to authenticated;
grant execute on function public.advance_coaching_week() to authenticated;

create temp table _ids on commit drop as
select
  (select id from public.users where is_admin order by created_at limit 1) as trainer,
  (select u.id from public.users u where not u.is_admin
     and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id)
     and not exists (select 1 from trainer_profiles p where p.user_id = u.id)
   order by u.created_at limit 1) as trainee,
  (select u.id from public.users u where not u.is_admin order by u.created_at desc limit 1) as other;
alter table _ids add column link uuid, add column plan uuid, add column day uuid, add column pe1 uuid, add column pe2 uuid, add column te uuid;
do $$
declare v _ids%rowtype; l uuid; p uuid; d uuid; t uuid; e1 uuid; e2 uuid;
begin
  select * into v from _ids;
  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
    values (v.trainer, v.trainee, 'coach-test', 'active', now()) returning id into l;
  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, shared_at)
    values (v.trainer, l, 'test', 2, 'shared', 'blank', now()) returning id into p;
  insert into plan_days (plan_id, week_number, day_number) values (p, 1, 1) returning id into d;
  insert into trainer_exercises (trainer_id, name, is_compound, is_bodyweight) values (v.trainer, 'テスト独自種目', false, false) returning id into t;
  insert into plan_exercises (plan_day_id, exercise_master_id, sort_order) values (d, (select id from exercise_master where name = 'デッドリフト'), 1) returning id into e1;
  insert into plan_exercises (plan_day_id, trainer_exercise_id, sort_order) values (d, t, 2) returning id into e2;
  update _ids set link = l, plan = p, day = d, pe1 = e1, pe2 = e2, te = t;
end $$;
create temp table _r (test text, ok boolean) on commit drop;
create temp table _v (k text, v uuid) on commit drop;
grant select on _ids to authenticated; grant insert, select on _r, _v to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
insert into _v select 'a1', public.ensure_plan_user_exercise(pe1) from _ids;
insert into _v select 'a2', public.ensure_plan_user_exercise(pe1) from _ids;
insert into _v select 'b1', public.ensure_plan_user_exercise(pe2) from _ids;
insert into _v select 'b2', public.ensure_plan_user_exercise(pe2) from _ids;
insert into _r select 'C01 master種目: 2回呼んでも同じuser_exercise', (select v from _v where k='a1') = (select v from _v where k='a2');
insert into _r select 'C02 独自種目: 2回呼んでも同じuser_exercise', (select v from _v where k='b1') = (select v from _v where k='b2');
insert into _r select 'C03 独自種目: 名前とtrainer_exercise_idがコピーされる',
  exists (select 1 from user_exercises where id = (select v from _v where k='b1') and custom_name = 'テスト独自種目' and trainer_exercise_id = (select te from _ids));
select public.skip_plan_exercise(pe1) from _ids;
insert into _r select 'C04 スキップが残る', exists (select 1 from plan_exercise_skips where plan_exercise_id = (select pe1 from _ids));
insert into training_sessions (user_id, trained_at, fatigue_level, memo) select trainee, current_date, 3, 'coach-test' from _ids;
insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, plan_exercise_id)
select (select id from training_sessions where memo = 'coach-test' and user_id = (select trainee from _ids)), (select v from _v where k='a1'), 1, 100, 5, (select pe1 from _ids);
insert into _r select 'C05 記録でスキップが消える', not exists (select 1 from plan_exercise_skips where plan_exercise_id = (select pe1 from _ids));
insert into _r select 'C06 最初の記録でプランが開始', (select status = 'active' and started_at is not null from coaching_plans where id = (select plan from _ids));
do $$ begin perform public.skip_plan_exercise((select pe1 from _ids)); insert into _r values ('C07 記録済みはスキップ不可', false);
exception when others then insert into _r values ('C07 記録済みはスキップ不可', sqlstate = 'P0001'); end $$;
insert into _r select 'C08 次の週へ → 2', public.advance_coaching_week() = 2;
do $$ begin perform public.advance_coaching_week(); insert into _r values ('C09 最終週より先には進めない', false);
exception when others then insert into _r values ('C09 最終週より先には進めない', sqlstate = 'P0001'); end $$;

select set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true) from _ids;
do $$ begin perform public.ensure_plan_user_exercise((select pe1 from _ids)); insert into _r values ('C10 第三者は種目を用意できない', false);
exception when others then insert into _r values ('C10 第三者は種目を用意できない', sqlstate = '42501'); end $$;
do $$ begin perform public.skip_plan_exercise((select pe2 from _ids)); insert into _r values ('C11 第三者はスキップできない', false);
exception when others then insert into _r values ('C11 第三者はスキップできない', sqlstate = '42501'); end $$;
do $$ begin perform public.advance_coaching_week(); insert into _r values ('C12 第三者は週を進められない', false);
exception when others then insert into _r values ('C12 第三者は週を進められない', sqlstate = '42501'); end $$;

reset role;
select test, ok from _r order by test;
rollback;
