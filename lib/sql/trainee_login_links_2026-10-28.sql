-- クライアントのログイン用リンク（2026-10-28 オーナー決定。資料の「顧客側のログイン摩擦の完全排除」）
--   トレーナーがクライアントを追加すると、招待コードの代わりにリンク（https://auxlog.app/join/<token>）を出す。
--   クライアントはリンクを開いて「はじめる」を押すだけで、アカウントができて自分のメニューに入る（メール・パスワード不要）。
--   - リンクは1回だけ・14日間。トレーナーはいつでも作り直せる（古いリンクは使えなくなる）。契約中のクライアントの
--     機種変更にも使う。トレーナーが見返せるよう、招待コードと同じくトークンはそのまま持つ（読めるのはトレーナー本人・チームの管理者）
--   - アカウントはクライアントが初めて「はじめる」を押した時に作る（サーバーが service_role で作り、use_trainee_login_link で紐付ける）
--   - すでに Auxlog のアカウントがある人は、ログインした状態でリンクを開き「このアカウントで受け取る」（redeem_trainee_login_link）
--   - 招待コードの発行はやめる（trainer_invites と redeem_trainer_invite は、公開中のアプリのために残す）

begin;

create table if not exists public.trainee_login_links (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.trainer_trainee_links(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trainee_login_links_link on public.trainee_login_links (link_id);
alter table public.trainee_login_links enable row level security;
drop policy if exists "trainee_login_links: trainer of the link or team owner" on public.trainee_login_links;
create policy "trainee_login_links: trainer of the link or team owner" on public.trainee_login_links
  for select using (exists (
    select 1 from trainer_trainee_links l
    where l.id = trainee_login_links.link_id and (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
  ));

-- 推測できないトークン（24バイトの乱数を URL に使える文字にした32文字）
create or replace function public.new_login_link_token()
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_token text;
begin
  loop
    v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
    exit when not exists (select 1 from trainee_login_links where token = v_token);
  end loop;
  return v_token;
end;
$function$;

-- リンクを作る（前の使っていないリンクは使えなくする）。中から呼ぶだけ
create or replace function public.issue_login_link_for(p_link_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_token text := public.new_login_link_token();
  v_expires timestamptz := now() + interval '14 days';
begin
  update trainee_login_links set revoked_at = now() where link_id = p_link_id and used_at is null and revoked_at is null;
  insert into trainee_login_links (link_id, token, expires_at) values (p_link_id, v_token, v_expires);
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$function$;

-- 契約を始める（招待中の枠にクライアントを紐付け、プランの開始日を入れ、セルフモードを終える）。中から呼ぶだけ
create or replace function public.activate_trainee_link(p_link_id uuid, p_user_id uuid, p_start_date date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update trainer_trainee_links set trainee_id = p_user_id, status = 'active', started_at = now() where id = p_link_id;
  update coaching_plans set start_date = p_start_date, updated_at = now()
  where link_id = p_link_id and status in ('shared', 'active');
  -- 同時に進められるプログラムは1つ: セルフモードのプログラムを終了する（記録は残る）
  update user_program_enrollments set is_active = false where user_id = p_user_id and is_active;
end;
$function$;

-- クライアントの追加: 招待コードの代わりにログイン用のリンクを出す（それ以外は今までどおり）
create or replace function public.add_trainee_with_plan(p_display_name text, p_template_id uuid, p_one_rms jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.assert_usable_template(p_template_id);
  v_name text := btrim(p_display_name);
  v_link uuid;
  v_plan uuid;
  v_day uuid;
  v_ex uuid;
  r_day record;
  r_ex record;
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'display name must be 1-40 characters' using errcode = '22023';
  end if;
  if (
    select count(*) from trainer_trainee_links
    where trainer_id = v_uid
      and trainee_id is distinct from trainer_id
      and status in ('invited', 'active', 'paused')
  ) >= public.trainer_trainee_limit(v_uid) then
    raise exception 'trainee limit reached' using errcode = 'P0001', hint = 'trainee_limit';
  end if;

  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status)
  values (v_uid, null, v_name, 'invited')
  returning id into v_link;

  -- テンプレートの作成条件（週ごとのフェーズ week_phases など）を引き継ぎ、入力した1RMを加える
  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id, generation_inputs, shared_at)
  select v_uid, v_link, name, total_weeks, 'shared', 'template', id,
         coalesce(generation_inputs, '{}'::jsonb) || jsonb_build_object('one_rms', coalesce(p_one_rms, '[]'::jsonb)), now()
  from coaching_plans where id = p_template_id
  returning id into v_plan;

  for r_day in select * from plan_days where plan_id = p_template_id loop
    insert into plan_days (plan_id, week_number, day_number, label)
    values (v_plan, r_day.week_number, r_day.day_number, r_day.label)
    returning id into v_day;

    for r_ex in select * from plan_exercises where plan_day_id = r_day.id loop
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, cardio_master_id, sort_order, note, target_duration_seconds, target_distance_km)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.cardio_master_id, r_ex.sort_order, r_ex.note, r_ex.target_duration_seconds, r_ex.target_distance_km)
      returning id into v_ex;

      -- %1RM のセットは、その種目の1RMが入力されていれば kg を入れる（2.5kg単位）。未入力なら空欄（自動）
      insert into plan_sets (plan_exercise_id, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, updated_by)
      select v_ex, s.set_number,
        coalesce(
          s.target_weight_kg,
          case when s.target_pct_1rm is not null and rm.one_rm_kg is not null
            then public.round_to_plate(s.target_pct_1rm * rm.one_rm_kg) end
        ),
        s.target_pct_1rm, s.target_reps, s.target_rir, s.is_warmup, v_uid
      from plan_sets s
      left join lateral (
        select (o->>'one_rm_kg')::numeric as one_rm_kg
        from jsonb_array_elements(coalesce(p_one_rms, '[]'::jsonb)) o
        where (r_ex.exercise_master_id is not null and o->>'exercise_master_id' = r_ex.exercise_master_id::text)
           or (r_ex.trainer_exercise_id is not null and o->>'trainer_exercise_id' = r_ex.trainer_exercise_id::text)
        limit 1
      ) rm on true
      where s.plan_exercise_id = r_ex.id;
    end loop;
  end loop;

  return jsonb_build_object('link_id', v_link, 'plan_id', v_plan) || public.issue_login_link_for(v_link);
end;
$function$;

-- トレーナーがリンクを作り直す（招待中: 期限切れ・紛失、契約中・一時停止: 機種変更など）
create or replace function public.issue_trainee_login_link(p_link_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.assert_trainer();
  v_link trainer_trainee_links%rowtype;
begin
  select * into v_link from trainer_trainee_links
  where id = p_link_id and trainer_id = v_uid and trainee_id is distinct from trainer_id and status in ('invited', 'active', 'paused');
  if not found then
    raise exception 'link not found' using errcode = '42501';
  end if;
  -- 新しく招待する分は、上限を超えている間（有料プランをやめた後など）は止める（今の契約中の人の再ログインは止めない）
  if v_link.status = 'invited' then
    perform public.assert_trainer_within_limit(v_uid);
  end if;
  return public.issue_login_link_for(p_link_id);
end;
$function$;

-- リンクの中身を見る（使わない）。「ようこそ」の画面の表示とサーバーの確認用。サーバー（service_role）からだけ呼ぶ
create or replace function public.peek_trainee_login_link(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_ll trainee_login_links%rowtype;
  v_link trainer_trainee_links%rowtype;
  v_trainer text;
begin
  select * into v_ll from trainee_login_links where token = p_token;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;
  select * into v_link from trainer_trainee_links where id = v_ll.link_id;
  select display_name into v_trainer from trainer_profiles where user_id = v_link.trainer_id;
  return jsonb_build_object(
    'state', case
      when v_ll.used_at is not null then 'used'
      when v_ll.revoked_at is not null then 'revoked'
      when v_ll.expires_at <= now() then 'expired'
      when v_link.status not in ('invited', 'active', 'paused') then 'ended'
      else 'valid' end,
    'link_id', v_link.id,
    'link_status', v_link.status,
    'trainee_id', v_link.trainee_id,
    'trainer_id', v_link.trainer_id,
    'client_name', v_link.trainee_display_name,
    'trainer_name', v_trainer,
    'expires_at', v_ll.expires_at
  );
end;
$function$;

-- リンクでログインする（1回で使い切る）。招待中なら p_user_id（サーバーが作ったアカウント）で契約を始める。
-- 契約中・一時停止なら、その枠のクライアント本人（p_user_id）であることを確かめる。サーバー（service_role）からだけ呼ぶ
create or replace function public.use_trainee_login_link(p_token text, p_user_id uuid, p_start_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ll trainee_login_links%rowtype;
  v_link trainer_trainee_links%rowtype;
begin
  select * into v_ll from trainee_login_links
  where token = p_token and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'login link is not valid' using errcode = 'P0001', hint = 'login_link_invalid';
  end if;
  select * into v_link from trainer_trainee_links where id = v_ll.link_id for update;
  if v_link.status = 'invited' then
    perform public.activate_trainee_link(v_link.id, p_user_id, p_start_date);
  elsif v_link.status not in ('active', 'paused') or v_link.trainee_id is distinct from p_user_id then
    raise exception 'login link is not valid' using errcode = 'P0001', hint = 'login_link_invalid';
  end if;
  update trainee_login_links set used_at = now() where id = v_ll.id;
  return v_link.id;
end;
$function$;

-- すでに Auxlog のアカウントがある人が、ログインした状態でリンクを受け取る（今までの招待コードの入力と同じ確かめ方）
create or replace function public.redeem_trainee_login_link(p_token text, p_start_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ll trainee_login_links%rowtype;
  v_link trainer_trainee_links%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_start_date is null or p_start_date < current_date - 2 or p_start_date > current_date + 2 then
    raise exception 'start date out of range' using errcode = '22023';
  end if;
  if exists (select 1 from users where id = v_uid and account_type = 'gym_owner') then
    raise exception 'gym owner accounts cannot be trainees' using errcode = '42501';
  end if;
  if exists (
    select 1 from trainer_trainee_links
    where trainee_id = v_uid and trainer_id <> v_uid and status in ('active', 'paused')
  ) then
    raise exception 'already has a trainer' using errcode = 'P0001', hint = 'already_linked';
  end if;

  select * into v_ll from trainee_login_links
  where token = p_token and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if found then
    select * into v_link from trainer_trainee_links where id = v_ll.link_id for update;
  end if;
  if v_ll.id is null or v_link.status <> 'invited' then
    raise exception 'login link is not valid' using errcode = 'P0001', hint = 'login_link_invalid';
  end if;
  if v_link.trainer_id = v_uid then
    raise exception 'cannot redeem own invite' using errcode = 'P0001', hint = 'own_invite';
  end if;

  perform public.activate_trainee_link(v_link.id, v_uid, p_start_date);
  update trainee_login_links set used_at = now() where id = v_ll.id;
  return v_link.id;
end;
$function$;

-- 呼べる人: 中から呼ぶだけのものは誰にも出さない。peek・use はサーバー（service_role）だけ
revoke execute on function public.new_login_link_token() from public, anon, authenticated;
revoke execute on function public.issue_login_link_for(uuid) from public, anon, authenticated;
revoke execute on function public.activate_trainee_link(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.peek_trainee_login_link(text) from public, anon, authenticated;
revoke execute on function public.use_trainee_login_link(text, uuid, date) from public, anon, authenticated;
grant execute on function public.peek_trainee_login_link(text) to service_role;
grant execute on function public.use_trainee_login_link(text, uuid, date) to service_role;
revoke execute on function public.issue_trainee_login_link(uuid) from public, anon;
grant execute on function public.issue_trainee_login_link(uuid) to authenticated;
revoke execute on function public.redeem_trainee_login_link(text, date) from public, anon;
grant execute on function public.redeem_trainee_login_link(text, date) to authenticated;

commit;
