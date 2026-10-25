-- コードレビューの残り（2026-10-25、DB側）。レビュー: https://claude.ai/artifact/M3FDB8hhK7Az5fFgZQdKV3
--
-- N1: 契約者一覧のアラート用データ（最後の記録日・1RM管理種目のセット）を DB で集計して1つの値で返す。
--     これまでは記録・セットを行のまま読んでいたため、PostgREST の上限（1000行）で黙って切れ、
--     トレーニーが増えると最後の記録日や停滞の判定が誤る。RLS（契約期間内の記録だけ）はそのまま効かせる。
-- L4: 招待コードの入力回数を制限する（同じ人が15分に10回まで間違えられる。総当たりでの推測を防ぐ）。
--     間違えた回数を残すため、コードが無効の時は例外ではなく null を返す（API が「正しくない」と返す）。

begin;

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

commit;
