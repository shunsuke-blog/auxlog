-- review_followups_2026-10-25.sql の確認（中身を含めて実行し、最後に ROLLBACK する）
begin;
-- コードレビューの残り（2026-10-25、DB側）。レビュー: https://claude.ai/artifact/M3FDB8hhK7Az5fFgZQdKV3
--
-- N1: 契約者一覧のアラート用データ（最後の記録日・1RM管理種目のセット）を DB で集計して1つの値で返す。
--     これまでは記録・セットを行のまま読んでいたため、PostgREST の上限（1000行）で黙って切れ、
--     トレーニーが増えると最後の記録日や停滞の判定が誤る。RLS（契約期間内の記録だけ）はそのまま効かせる。
-- L4: 招待コードの入力回数を制限する（同じ人が15分に10回まで間違えられる。総当たりでの推測を防ぐ）。
--     間違えた回数を残すため、コードが無効の時は例外ではなく null を返す（API が「正しくない」と返す）。


-- N1 ----------------------------------------------------------------------
-- 呼び出したトレーナーの契約者について、最後の記録日（契約期間内で最新）と、p_since 以降の
-- 1RM管理種目のワーキングセット（種目・日ごとに推定1RMが最も高い1セット）を返す。
-- 判定（7日記録なし・3週間停滞）は TS 側（lib/trainer/traineeStatus.ts、テストあり）で行う。
create or replace function public.trainer_trainee_activity(p_since date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with trainees as (
    select distinct trainee_id as user_id from trainer_trainee_links
    where trainer_id = auth.uid() and trainee_id is not null
  ),
  last_on as (
    select s.user_id, max(s.trained_at) as trained_on
    from training_sessions s join trainees t on t.user_id = s.user_id
    group by s.user_id
  ),
  samples as (
    select distinct on (s.user_id, ue.exercise_master_id, s.trained_at)
      s.user_id, ue.exercise_master_id, s.trained_at, t.weight_kg, t.reps
    from training_sessions s
    join trainees tr on tr.user_id = s.user_id
    join training_sets t on t.session_id = s.id
    join user_exercises ue on ue.id = t.exercise_id
    join exercise_master em on em.id = ue.exercise_master_id
    where s.trained_at >= p_since and em.requires_one_rm and not t.is_warmup and t.weight_kg > 0 and t.reps > 0
    order by s.user_id, ue.exercise_master_id, s.trained_at,
      case when t.reps <= 1 then t.weight_kg else t.weight_kg * (1 + t.reps / 30.0) end desc
  )
  select jsonb_build_object(
    'last', coalesce((select jsonb_object_agg(user_id, trained_on) from last_on), '{}'::jsonb),
    'samples', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'exercise', exercise_master_id, 'trained_on', trained_at, 'weight_kg', weight_kg, 'reps', reps)) from samples), '[]'::jsonb)
  )
$$;

revoke execute on function public.trainer_trainee_activity(date) from public, anon;
grant execute on function public.trainer_trainee_activity(date) to authenticated;

-- L4 ----------------------------------------------------------------------
create table public.trainer_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index trainer_invite_attempts_user_idx on public.trainer_invite_attempts (user_id, attempted_at desc);
-- 読み書きは redeem_trainer_invite（security definer）からだけ
alter table public.trainer_invite_attempts enable row level security;
revoke all on public.trainer_invite_attempts from public, anon, authenticated;

-- 招待コードを入力する（トレーニー側）。契約を開始し、セルフモードのプログラムを終了する。
-- コードが無効なら null を返し、間違えた回数を残す（15分に10回を超えると too_many_attempts）。
create or replace function public.redeem_trainer_invite(p_code text, p_start_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite trainer_invites%rowtype;
  v_link trainer_trainee_links%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_start_date is not null and (p_start_date < current_date - 365 or p_start_date > current_date + 365) then
    raise exception 'start date out of range' using errcode = '22023';
  end if;
  if exists (select 1 from users where id = v_uid and account_type = 'gym_owner') then
    raise exception 'gym owner accounts cannot be trainees' using errcode = '42501';
  end if;

  -- 同じ人の同時の入力は1つずつ数える（並べて送って回数の制限をすり抜けない）
  perform pg_advisory_xact_lock(hashtextextended('redeem_trainer_invite:' || v_uid::text, 0));
  if (select count(*) from trainer_invite_attempts where user_id = v_uid and attempted_at > now() - interval '15 minutes') >= 10 then
    raise exception 'too many attempts' using errcode = 'P0001', hint = 'too_many_attempts';
  end if;
  -- コードが正しいかを確かめる前に判定する（担当のいる人に、コードが存在するかを教えない）
  if exists (
    select 1 from trainer_trainee_links
    where trainee_id = v_uid and trainer_id <> v_uid and status in ('active', 'paused')
  ) then
    raise exception 'already has a trainer' using errcode = 'P0001', hint = 'already_linked';
  end if;

  select * into v_invite from trainer_invites
  where code = upper(btrim(p_code)) and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if found then
    select * into v_link from trainer_trainee_links where id = v_invite.link_id for update;
  end if;
  if v_invite.id is null or v_link.status <> 'invited' then
    insert into trainer_invite_attempts (user_id) values (v_uid);
    delete from trainer_invite_attempts where user_id = v_uid and attempted_at < now() - interval '1 day';
    return null;
  end if;
  if v_link.trainer_id = v_uid then
    raise exception 'cannot redeem own invite' using errcode = 'P0001', hint = 'own_invite';
  end if;

  update trainer_trainee_links set trainee_id = v_uid, status = 'active', started_at = now() where id = v_link.id;
  update trainer_invites set used_at = now() where id = v_invite.id;
  -- トレーニーが選んだ開始日（過去の日付も可）。週の日付の表示に使う（2026-10-25）
  update coaching_plans set start_date = coalesce(p_start_date, current_date), updated_at = now()
  where link_id = v_link.id and status in ('shared', 'active');
  -- 同時に進められるプログラムは1つ: セルフモードのプログラムを終了する（記録は残る）
  update user_program_enrollments set is_active = false where user_id = v_uid and is_active;

  return v_link.id;
end;
$$;

revoke execute on function public.redeem_trainer_invite(text, date) from public, anon;
grant execute on function public.redeem_trainer_invite(text, date) to authenticated;


-- テスト ----------------------------------------------------------------------
create temp table _ids on commit drop as
select (select id from public.users where is_admin order by created_at limit 1) as trainer,
  (select u.id from public.users u where not u.is_admin and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id) and not exists (select 1 from trainer_profiles p where p.user_id = u.id) order by u.created_at limit 1) as trainee,
  (select u.id from public.users u where not u.is_admin and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id) and not exists (select 1 from trainer_profiles p where p.user_id = u.id) order by u.created_at limit 1 offset 1) as guesser,
  (select u.id from public.users u where not u.is_admin and not exists (select 1 from trainer_trainee_links l where l.trainee_id = u.id or l.trainer_id = u.id) order by u.created_at desc limit 1) as other_trainer;
alter table _ids add column link uuid, add column invite_link uuid;
do $$
declare v _ids%rowtype; l uuid; l2 uuid; bench uuid; curl uuid; s uuid; d int;
begin
  select * into v from _ids;
  -- 200日前から契約中のトレーニー。130日分の記録、1日10セット（計1300セット＋1RM管理外の種目）
  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at) values (v.trainer, v.trainee, 'act-test', 'active', now() - interval '200 days') returning id into l;
  insert into user_exercises (user_id, exercise_master_id) values (v.trainee, (select id from exercise_master where code='barbell_bench_press')) returning id into bench;
  insert into user_exercises (user_id, exercise_master_id) values (v.trainee, (select id from exercise_master where requires_one_rm = false limit 1)) returning id into curl;
  for d in 0..129 loop
    insert into training_sessions (user_id, trained_at, fatigue_level, memo) values (v.trainee, current_date - d, 3, 'act-test') returning id into s;
    insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, is_warmup)
    select s, bench, n, case when n = 1 then 100 when n = 2 then 90 when n = 3 then 80 when n = 4 then 150 else 60 end,
      case when n = 1 then 1 when n = 2 then 5 when n = 3 then 10 when n = 4 then 1 else 8 end,
      n = 4  -- 4セット目（150kg）はウォームアップ扱い＝対象外
    from generate_series(1, 10) n;
    insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps) values (s, curl, 1, 200, 10);
  end loop;
  -- 招待コード（入力回数の制限の確認用）
  insert into trainer_trainee_links (trainer_id, trainee_display_name, status) values (v.trainer, 'invite-test', 'invited') returning id into l2;
  insert into trainer_invites (link_id, code, expires_at) values (l2, 'ZZTEST01', now() + interval '1 day');
  update _ids set link = l, invite_link = l2;
end $$;
create temp table _r (test text, ok boolean) on commit drop;
create temp table _act (j jsonb) on commit drop;
grant select, update on _ids to authenticated; grant insert, select on _r, _act to authenticated;

-- N1: トレーナーとして集計を読む
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;
insert into _act select public.trainer_trainee_activity(current_date - 119);
insert into _r select 'N01 最後の記録日は今日', (select (j->'last'->>(select trainee::text from _ids))::date = current_date from _act);
insert into _r select 'N02 1300セットあっても切れずに120日分（種目・日ごとに1件）', (select count(*) = 120 from _act, jsonb_array_elements(j->'samples') e where e->>'user_id' = (select trainee::text from _ids));
insert into _r select 'N03 推定1RMが最も高いセット（80kg×10）を選ぶ・ウォームアップと1RM管理外は除く', (select bool_and((e->>'weight_kg')::numeric = 80 and (e->>'reps')::int = 10) from _act, jsonb_array_elements(j->'samples') e where e->>'user_id' = (select trainee::text from _ids));
reset role;
-- 契約期間外は見えない（開始日を3日前にすると、それ以前の記録は数えない）
update trainer_trainee_links set started_at = now() - interval '3 days' where id = (select link from _ids);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', trainer, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'N04 契約開始前の記録は集計しない（RLS）', (select count(*) between 3 and 4 from jsonb_array_elements(public.trainer_trainee_activity(current_date - 119)->'samples') e where e->>'user_id' = (select trainee::text from _ids));
-- 担当していないトレーナーには見えない
select set_config('request.jwt.claims', json_build_object('sub', other_trainer, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'N05 担当外のトレーナーには何も返さない', public.trainer_trainee_activity(current_date - 119) = '{"last": {}, "samples": []}'::jsonb;

-- L4: 招待コードの入力回数
select set_config('request.jwt.claims', json_build_object('sub', guesser, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'L01 間違ったコードは null（例外にしない）', public.redeem_trainer_invite('WRONG001') is null;
do $$ begin for i in 2..10 loop perform public.redeem_trainer_invite('WRONG00' || i); end loop; end $$;
do $$ begin perform public.redeem_trainer_invite('ZZTEST01'); insert into _r values ('L02 10回間違えると正しいコードでも止まる', false);
exception when others then insert into _r values ('L02 10回間違えると正しいコードでも止まる', sqlstate = 'P0001' and sqlerrm = 'too many attempts'); end $$;
do $$ begin perform count(*) from trainer_invite_attempts; insert into _r values ('L03 入力回数の記録は利用者から読めない', false);
exception when insufficient_privilege then insert into _r values ('L03 入力回数の記録は利用者から読めない', true); end $$;
reset role;
insert into _r select 'L04 間違えた10回が残っている', (select count(*) = 10 from trainer_invite_attempts where user_id = (select guesser from _ids));
update trainer_invite_attempts set attempted_at = now() - interval '16 minutes' where user_id = (select guesser from _ids);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', guesser, 'role', 'authenticated')::text, true) from _ids;
insert into _r select 'L05 15分たてば正しいコードで契約できる', public.redeem_trainer_invite('zztest01 ') = (select invite_link from _ids);
do $$ begin perform public.redeem_trainer_invite('WRONG999'); insert into _r values ('L06 担当がいる人には、コードの正否より先に already_linked', false);
exception when others then insert into _r values ('L06 担当がいる人には、コードの正否より先に already_linked', sqlerrm = 'already has a trainer'); end $$;
reset role;
select test, ok from _r order by test;
rollback;
