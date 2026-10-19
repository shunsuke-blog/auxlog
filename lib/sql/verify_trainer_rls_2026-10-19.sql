-- トレーナー機能のRLS・トリガーの確認（2026-10-19）
--
-- trainer_foundation_2026-10-19.sql の適用後に実行する。全体を ROLLBACK するので本番データは変わらない。
-- 既存ユーザー3人（トレーナー役=管理者、トレーニー役=記録の多いユーザー、無関係な第三者）を使い、
-- 一時的に契約・プランを作ってロールを切り替えながら判定する。
-- 結果は最後の SELECT に1行1テストで出る（ok = true なら合格）。読み取るのは件数だけ。

begin;

-- 役割と期待値（postgres として算出）
create temp table _ids on commit drop as
with t as (
  select id as trainer from public.users where is_admin order by created_at limit 1
), e as (
  select s.user_id as trainee
  from public.training_sessions s, t
  where s.user_id <> t.trainer
  group by s.user_id
  order by count(*) desc
  limit 1
), dates as (
  select s.trained_at, row_number() over (order by s.trained_at, s.id) as rn, count(*) over () as n
  from public.training_sessions s, e
  where s.user_id = e.trainee
)
select
  t.trainer,
  e.trainee,
  (select u.id from public.users u where u.id not in (t.trainer, e.trainee) order by u.created_at limit 1) as other,
  (select trained_at from dates where rn = greatest(1, n / 2)) as started_on,
  (select trained_at from dates where rn = greatest(1, (n * 3) / 4)) as ended_on
from t, e;

alter table _ids add column total_cnt int, add column after_cnt int, add column window_cnt int, add column bests_cnt int;
update _ids set
  total_cnt = (select count(*) from public.training_sessions s where s.user_id = _ids.trainee),
  after_cnt = (select count(*) from public.training_sessions s where s.user_id = _ids.trainee and s.trained_at >= _ids.started_on),
  window_cnt = (select count(*) from public.training_sessions s where s.user_id = _ids.trainee
                  and s.trained_at between _ids.started_on and _ids.ended_on),
  bests_cnt = (select count(*) from public.exercise_bests b where b.user_id = _ids.trainee);

create temp table _r (test text, ok boolean) on commit drop;
grant select on _ids to authenticated;
grant insert, select on _r to authenticated;

-- 契約（active）を作る
create temp table _link on commit drop as
with ins as (
  insert into public.trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
  select trainer, trainee, 'rls-test', 'active', started_on::timestamptz from _ids
  returning id
) select id from ins;
grant select on _link to authenticated;

-- 契約中のトレーナー --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;

insert into _r select 'T01 active: 契約開始日以降のセッションだけ見える',
  (select count(*) from public.training_sessions s where s.user_id = (select trainee from _ids)) = (select after_cnt from _ids);
insert into _r select 'T02 active: 見えるセッションのセットも見える',
  exists (select 1 from public.training_sets ts join public.training_sessions s on s.id = ts.session_id
          where s.user_id = (select trainee from _ids));
insert into _r select 'T03 active: 自己ベストが見える',
  (select count(*) from public.exercise_bests b where b.user_id = (select trainee from _ids)) = (select bests_cnt from _ids);
insert into _r select 'T04 active: 種目名（user_exercises）が見える',
  exists (select 1 from public.user_exercises ue where ue.user_id = (select trainee from _ids));
reset role;

-- 一時停止 --------------------------------------------------------------------
update public.trainer_trainee_links set status = 'paused', paused_at = now() where id = (select id from _link);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T05 paused: セッションが見えない',
  (select count(*) from public.training_sessions s where s.user_id = (select trainee from _ids)) = 0;
insert into _r select 'T06 paused: 自己ベストが見えない',
  (select count(*) from public.exercise_bests b where b.user_id = (select trainee from _ids)) = 0;
reset role;

-- 契約終了 --------------------------------------------------------------------
update public.trainer_trainee_links
  set status = 'ended', ended_at = (select ended_on from _ids)::timestamptz + interval '12 hours'
  where id = (select id from _link);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T07 ended: 契約期間内のセッションだけ見える',
  (select count(*) from public.training_sessions s where s.user_id = (select trainee from _ids)) = (select window_cnt from _ids);
insert into _r select 'T08 ended: 自己ベストは見えない',
  (select count(*) from public.exercise_bests b where b.user_id = (select trainee from _ids)) = 0;
insert into _r select 'T09 ended: 種目名は見える（過去の記録の表示用）',
  exists (select 1 from public.user_exercises ue where ue.user_id = (select trainee from _ids));
reset role;

-- 無関係な第三者・トレーニー本人 ---------------------------------------------
update public.trainer_trainee_links set status = 'active', ended_at = null where id = (select id from _link);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T10 第三者: トレーニーのセッションが見えない',
  (select count(*) from public.training_sessions s where s.user_id = (select trainee from _ids)) = 0;
insert into _r select 'T11 第三者: 他人の契約が見えない',
  (select count(*) from public.trainer_trainee_links) = 0;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T12 本人: 自分のセッションは全件見える',
  (select count(*) from public.training_sessions s where s.user_id = (select trainee from _ids)) = (select total_cnt from _ids);
insert into _r select 'T13 本人: 自分の契約が見える',
  (select count(*) from public.trainer_trainee_links) = 1;
reset role;

-- 書き込み権限・RLSの再帰 ----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;
do $$
begin
  begin
    insert into public.coaching_plans (trainer_id, name, total_weeks, status, source)
    values (auth.uid(), 'x', 1, 'draft', 'blank');
    insert into _r values ('T14 クライアントからプランを作れない', false);
  exception when insufficient_privilege then
    insert into _r values ('T14 クライアントからプランを作れない', true);
  end;
  begin
    perform count(*) from public.organizations;
    perform count(*) from public.organization_memberships;
    perform count(*) from public.organization_invites;
    perform count(*) from public.trainer_profiles;
    insert into _r values ('T15 組織まわりのRLSが再帰しない', true);
  exception when others then
    insert into _r values ('T15 組織まわりのRLSが再帰しない', false);
  end;
end $$;
reset role;

-- プランの閲覧とplan_exercise_idの検証 ----------------------------------------
-- 契約中のプラン（共有済み）と、トレーナー自身の別プラン（他人のプラン役）を作る
create temp table _plan on commit drop as
with p as (
  insert into public.coaching_plans (trainer_id, link_id, name, total_weeks, status, source)
  select trainer, (select id from _link), 'rls-test', 1, 'shared', 'blank' from _ids returning id
), d as (
  insert into public.plan_days (plan_id, week_number, day_number) select id, 1, 1 from p returning id
), x as (
  insert into public.plan_exercises (plan_day_id, exercise_master_id)
  select d.id, (select id from public.exercise_master order by sort_order limit 1) from d returning id
)
select (select id from p) as plan_id, (select id from x) as plan_exercise_id;

create temp table _foreign on commit drop as
with l as (
  insert into public.trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
  select trainer, trainer, 'self', 'active', now() from _ids returning id
), p as (
  insert into public.coaching_plans (trainer_id, link_id, name, total_weeks, status, source)
  select (select trainer from _ids), id, 'foreign', 1, 'shared', 'blank' from l returning id
), d as (
  insert into public.plan_days (plan_id, week_number, day_number) select id, 1, 1 from p returning id
), x as (
  insert into public.plan_exercises (plan_day_id, exercise_master_id)
  select d.id, (select id from public.exercise_master order by sort_order limit 1) from d returning id
)
select (select id from x) as plan_exercise_id;

grant select on _plan, _foreign to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainee, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T16 トレーニー: 共有されたプランが見える',
  (select count(*) from public.coaching_plans) = 1
  and (select count(*) from public.plan_exercises) = 1;
do $$
declare
  v_session uuid;
  v_exercise uuid;
begin
  select id into v_session from public.training_sessions where user_id = auth.uid() order by trained_at desc limit 1;
  select id into v_exercise from public.user_exercises where user_id = auth.uid() limit 1;
  begin
    insert into public.training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, plan_exercise_id)
    values (v_session, v_exercise, 99, 1, 1, false, (select plan_exercise_id from _foreign));
    insert into _r values ('T17 他人のプランの種目IDで記録できない', false);
  exception when insufficient_privilege then
    insert into _r values ('T17 他人のプランの種目IDで記録できない', true);
  end;
  begin
    insert into public.training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, plan_exercise_id)
    values (v_session, v_exercise, 98, 1, 1, false, (select plan_exercise_id from _plan));
    insert into _r values ('T18 自分のプランの種目IDで記録できる', true);
  exception when others then
    insert into _r values ('T18 自分のプランの種目IDで記録できる', false);
  end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'T19 第三者: プランが見えない', (select count(*) from public.coaching_plans) = 0;
reset role;

select test, ok from _r order by test;

rollback;
