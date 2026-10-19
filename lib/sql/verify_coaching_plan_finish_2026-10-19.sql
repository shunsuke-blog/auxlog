-- コーチングプランの完了・契約終了後の日数取得・有効プログラム1つの確認（2026-10-19）
-- coaching_plan_finish_2026-10-19.sql の中身を含めて実行し、最後に ROLLBACK するので本番データは変わらない。
begin;
-- コーチングプランの完了と、契約終了後のセルフモード自動作成の下準備（2026-10-19）
--
-- 決定事項:
--   - 契約中はプランが終わってもセルフモードを作らない。成長レポートを見せてプランを完了し、
--     ホームでトレーナーの次のプランを待つ
--   - セルフモードは契約が終わった時だけ、記録から1RMを推定して自動で作る


-- 同時に進められるセルフモードのプログラムは1人1つ（自動作成が同時に走っても2つ作らない）。
-- 適用前に重複が無いことを確認済み（2026-10-19、0件）。
create unique index user_program_enrollments_one_active_per_user
  on public.user_program_enrollments (user_id) where is_active;

-- プランを完了する（トレーニーが最終週の後に成長レポートを見て押す）
create or replace function public.finish_coaching_plan()
returns void
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
  if v_plan.current_week < v_plan.total_weeks then
    raise exception 'not final week' using errcode = 'P0001', hint = 'not_final_week';
  end if;
  update coaching_plans set status = 'ended', updated_at = now() where id = v_plan.id;
end;
$$;

-- 契約が終わった最後のプランの1週目の日数（セルフモードの自動作成で週の日数に使う）。
-- 終了後のプランはトレーニーからRLSで読めないため、日数だけを返す。
create or replace function public.ended_plan_days_per_week(p_link_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from plan_days d
  where d.week_number = 1
    and d.plan_id = (
      select p.id from coaching_plans p
      join trainer_trainee_links l on l.id = p.link_id
      where l.id = p_link_id and l.trainee_id = auth.uid() and l.status = 'ended'
      order by p.created_at desc
      limit 1
    );
$$;

revoke execute on function public.finish_coaching_plan() from public, anon;
revoke execute on function public.ended_plan_days_per_week(uuid) from public, anon;
grant execute on function public.finish_coaching_plan() to authenticated;
grant execute on function public.ended_plan_days_per_week(uuid) to authenticated;

create temp table _ids on commit drop as
select
  (select id from public.users where is_admin order by created_at limit 1) as trainer,
  (select u.id from public.users u where not u.is_admin
     and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id)
     and not exists (select 1 from trainer_profiles p where p.user_id = u.id)
   order by u.created_at limit 1) as trainee,
  (select u.id from public.users u where not u.is_admin order by u.created_at desc limit 1) as other;
alter table _ids add column link uuid, add column plan uuid;
do $$
declare v _ids%rowtype; l uuid; p uuid;
begin
  select * into v from _ids;
  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
    values (v.trainer, v.trainee, 'finish-test', 'active', now()) returning id into l;
  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, shared_at)
    values (v.trainer, l, 'test', 2, 'active', 'blank', now()) returning id into p;
  insert into plan_days (plan_id, week_number, day_number) values (p, 1, 1), (p, 1, 2), (p, 2, 1), (p, 2, 2);
  update _ids set link = l, plan = p;
end $$;
create temp table _r (test text, ok boolean) on commit drop;
grant select on _ids to authenticated; grant insert, select on _r to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
do $$ begin perform public.finish_coaching_plan(); insert into _r values ('F01 最終週の前は完了できない', false);
exception when others then insert into _r values ('F01 最終週の前は完了できない', sqlstate = 'P0001'); end $$;
select public.advance_coaching_week();
select public.finish_coaching_plan();
insert into _r select 'F03 完了後もトレーナーとの契約は続く', (select status from trainer_trainee_links where id = (select link from _ids)) = 'active';
do $$ begin perform public.finish_coaching_plan(); insert into _r values ('F04 進行中のプランが無ければ完了できない', false);
exception when others then insert into _r values ('F04 進行中のプランが無ければ完了できない', sqlstate = '42501'); end $$;
insert into _r select 'F05 契約中は日数を返さない', public.ended_plan_days_per_week((select link from _ids)) = 0;
select public.end_trainer_contract(link) from _ids;
insert into _r select 'F06 契約終了後は最後のプランの週の日数を返す', public.ended_plan_days_per_week((select link from _ids)) = 2;

select set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'F07 第三者には日数を返さない', public.ended_plan_days_per_week((select link from _ids)) = 0;

reset role;
insert into _r select 'F02 最終週の後は完了できる（ended、トレーニーからは読めなくなる）', (select status from coaching_plans where id = (select plan from _ids)) = 'ended';
insert into _r select 'F08 有効なプログラムは1人1つ（一意インデックス）',
  exists (select 1 from pg_indexes where indexname = 'user_program_enrollments_one_active_per_user');
select test, ok from _r order by test;
rollback;
