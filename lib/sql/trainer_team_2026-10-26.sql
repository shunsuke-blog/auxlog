-- ビジネスプランのチーム（2026-10-26 オーナー決定）
--   - ビジネスを申し込んだトレーナーが管理者。チームのトレーナーは3名まで:
--     管理者がクライアントを担当する（owner_is_trainer）なら管理者＋2名、担当しないならトレーナー3名。
--   - トレーナーはチームの招待コードで参加を申請し、管理者が承認する。承認されたトレーナーはクライアント無制限。
--   - 管理者は、チーム全体のクライアント（一覧・進み具合・記録）を見られる（編集はできない）。
--   - 管理者のテンプレートは、チームのトレーナーも閲覧・クライアントへの割り当てができる（編集は管理者だけ）。
--   - 管理者は、クライアントの担当をチームのトレーナー間で替えられる。
--   - チームが有効なのは管理者のプランがビジネスの間だけ。解約するとメンバーは自分のプランに戻る
--     （上限を超えればロック: trainer_billing_2026-10-26）。
--   既存の organizations / organization_invites / organization_memberships（2026-10-19、未使用）を使う。

begin;

alter table public.organizations add column if not exists owner_is_trainer boolean not null default true;
create unique index if not exists organizations_one_per_owner on public.organizations (owner_user_id);

-- ---------------------------------------------------------------------------
-- 判定
-- ---------------------------------------------------------------------------

-- p_trainer が属する有効なチーム（管理者として、または承認済みのメンバーとして）
create or replace function public.active_team_of(p_trainer uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from organizations o
  join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
  where o.owner_user_id = p_trainer
     or exists (
       select 1 from organization_memberships m
       where m.organization_id = o.id and m.trainer_id = p_trainer and m.status = 'approved'
     )
  limit 1;
$$;
revoke execute on function public.active_team_of(uuid) from public, anon, authenticated;

-- ログイン中の人が、p_trainer の所属する有効なチームの管理者か（p_trainer は承認済みのメンバー）
create or replace function public.is_team_owner_of(p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organizations o
    join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
    join organization_memberships m on m.organization_id = o.id and m.status = 'approved'
    where o.owner_user_id = auth.uid() and m.trainer_id = p_trainer
  );
$$;

-- ログイン中の人が、p_owner が管理者の有効なチームの承認済みメンバーか
create or replace function public.is_team_member_of_owner(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organizations o
    join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
    join organization_memberships m on m.organization_id = o.id and m.status = 'approved'
    where o.owner_user_id = p_owner and m.trainer_id = auth.uid()
  );
$$;

-- ログイン中の人と p_user が同じ有効なチームにいるか（メンバー同士の名前の表示）
create or replace function public.is_teammate(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.active_team_of(auth.uid()) is not null
     and public.active_team_of(auth.uid()) = public.active_team_of(p_user);
$$;

-- 実際に使えるプラン: 自分のプラン、または有効なチームのメンバーならビジネス
create or replace function public.trainer_effective_plan(p_trainer uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.active_team_of(p_trainer) is not null then 'business'
    else coalesce((select plan from trainer_profiles where user_id = p_trainer), 'starter')
  end;
$$;
revoke execute on function public.trainer_effective_plan(uuid) from public, anon, authenticated;

-- クライアントの上限。クライアントを担当しない管理者は 0（招待できない）
create or replace function public.trainer_trainee_limit(p_trainer uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from organizations o join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
      where o.owner_user_id = p_trainer and not o.owner_is_trainer
    ) then 0
    else case public.trainer_effective_plan(p_trainer)
      when 'pro' then 30
      when 'business' then 2147483647
      else 3
    end
  end;
$$;
revoke execute on function public.trainer_trainee_limit(uuid) from public, anon, authenticated;

-- チームのトレーナーの数（承認済みのメンバー＋クライアントを担当する管理者）。上限3
create or replace function public.team_trainer_count(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::int from organization_memberships where organization_id = p_org and status = 'approved')
       + (select case when owner_is_trainer then 1 else 0 end from organizations where id = p_org);
$$;
revoke execute on function public.team_trainer_count(uuid) from public, anon, authenticated;

-- テンプレートを割り当てに使えるか: 自分のテンプレート、または有効なチームの管理者のテンプレート
create or replace function public.assert_usable_template(p_plan_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_owner uuid;
begin
  select trainer_id into v_owner from coaching_plans where id = p_plan_id and link_id is null;
  if v_owner is null or (v_owner <> v_uid and not public.is_team_member_of_owner(v_owner)) then
    raise exception 'template not found' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke execute on function public.assert_usable_template(uuid) from public, anon, authenticated;

-- 管理者の有効なチーム（管理者でなければ例外）
create or replace function public.assert_team_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select o.id into v_org
  from organizations o
  join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
  where o.owner_user_id = auth.uid();
  if v_org is null then
    raise exception 'team owner only' using errcode = '42501';
  end if;
  return v_org;
end;
$$;
revoke execute on function public.assert_team_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 操作
-- ---------------------------------------------------------------------------

-- チームを作る（ビジネスプランのトレーナーだけ。1人1チーム）。作った時に招待コードも発行する
create or replace function public.create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_name text := btrim(p_name);
  v_org uuid;
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'team name must be 1-40 characters' using errcode = '22023';
  end if;
  if (select plan from trainer_profiles where user_id = v_uid) <> 'business' then
    raise exception 'business plan required' using errcode = 'P0001', hint = 'business_required';
  end if;
  if exists (select 1 from organization_memberships where trainer_id = v_uid and status in ('pending', 'approved')) then
    raise exception 'already in a team' using errcode = 'P0001', hint = 'already_in_team';
  end if;
  select id into v_org from organizations where owner_user_id = v_uid;
  if v_org is not null then
    update organizations set name = v_name where id = v_org;
    return v_org;
  end if;
  insert into organizations (owner_user_id, name) values (v_uid, v_name) returning id into v_org;
  insert into organization_invites (organization_id, code) values (v_org, public.new_invite_code());
  return v_org;
end;
$$;

create or replace function public.rename_team(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.assert_team_owner();
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'team name must be 1-40 characters' using errcode = '22023';
  end if;
  update organizations set name = v_name where id = v_org;
end;
$$;

-- チームの招待コードを作り直す（前のコードは使えなくなる）
create or replace function public.reissue_team_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.assert_team_owner();
  v_code text := public.new_invite_code();
begin
  update organization_invites set revoked_at = now() where organization_id = v_org and revoked_at is null;
  insert into organization_invites (organization_id, code) values (v_org, v_code);
  return v_code;
end;
$$;

-- 招待コードでチームに参加を申請する（管理者の承認で参加）。自分でプロ・ビジネスを契約中なら先に解約してもらう
create or replace function public.join_team(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_org organizations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('join_team:' || v_uid::text, 0));
  if (select count(*) from trainer_invite_attempts where user_id = v_uid and attempted_at > now() - interval '15 minutes') >= 10 then
    raise exception 'too many attempts' using errcode = 'P0001', hint = 'too_many_attempts';
  end if;
  if exists (select 1 from organizations where owner_user_id = v_uid)
     or exists (select 1 from organization_memberships where trainer_id = v_uid and status in ('pending', 'approved')) then
    raise exception 'already in a team' using errcode = 'P0001', hint = 'already_in_team';
  end if;
  if exists (
    select 1 from trainer_profiles
    where user_id = v_uid and subscription_status in ('active', 'trialing', 'past_due') and not cancel_at_period_end
  ) then
    raise exception 'has own subscription' using errcode = 'P0001', hint = 'own_subscription';
  end if;

  select o.* into v_org
  from organization_invites i
  join organizations o on o.id = i.organization_id
  join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
  where i.code = upper(btrim(p_code)) and i.revoked_at is null and (i.expires_at is null or i.expires_at > now());
  if v_org.id is null then
    insert into trainer_invite_attempts (user_id) values (v_uid);
    raise exception 'invalid code' using errcode = 'P0001', hint = 'invalid_code';
  end if;

  insert into organization_memberships (organization_id, trainer_id, status) values (v_org.id, v_uid, 'pending');
  return v_org.name;
end;
$$;

-- 参加の申請を承認・却下する（承認はトレーナー3名まで）
create or replace function public.decide_team_member(p_membership_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.assert_team_owner();
begin
  perform 1 from organizations where id = v_org for update;
  if not exists (select 1 from organization_memberships where id = p_membership_id and organization_id = v_org and status = 'pending') then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if p_approve and public.team_trainer_count(v_org) >= 3 then
    raise exception 'team is full' using errcode = 'P0001', hint = 'team_full';
  end if;
  update organization_memberships
  set status = case when p_approve then 'approved' else 'rejected' end,
      approved_at = case when p_approve then now() end
  where id = p_membership_id;
end;
$$;

-- メンバーを外す（管理者）。クライアントはそのトレーナーに残る（先に担当替えしておく）
create or replace function public.remove_team_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.assert_team_owner();
begin
  update organization_memberships set status = 'left', left_at = now()
  where id = p_membership_id and organization_id = v_org and status in ('pending', 'approved');
  if not found then
    raise exception 'member not found' using errcode = '42501';
  end if;
end;
$$;

-- チームを抜ける・申請を取り消す（メンバー）
create or replace function public.leave_team()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
begin
  update organization_memberships set status = 'left', left_at = now()
  where trainer_id = v_uid and status in ('pending', 'approved');
  if not found then
    raise exception 'not in a team' using errcode = 'P0001', hint = 'not_in_team';
  end if;
end;
$$;

-- 管理者がクライアントを担当するか。担当しない場合は自分のクライアントがいないこと、担当する場合は3名に収まること
create or replace function public.set_team_owner_is_trainer(p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.assert_team_owner();
begin
  perform 1 from organizations where id = v_org for update;
  if (select owner_is_trainer from organizations where id = v_org) = p_value then
    return;
  end if;
  if not p_value and exists (
    select 1 from trainer_trainee_links
    where trainer_id = auth.uid() and trainee_id is distinct from trainer_id and status in ('invited', 'active', 'paused')
  ) then
    raise exception 'owner has clients' using errcode = 'P0001', hint = 'owner_has_clients';
  end if;
  if p_value and public.team_trainer_count(v_org) >= 3 then
    raise exception 'team is full' using errcode = 'P0001', hint = 'team_full';
  end if;
  update organizations set owner_is_trainer = p_value where id = v_org;
end;
$$;

-- クライアントの担当替え（管理者）。チームのトレーナー間だけ。契約・プラン・記録はそのまま引き継ぐ
create or replace function public.reassign_trainee_link(p_link_id uuid, p_to_trainer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.assert_team_owner();
  v_link trainer_trainee_links%rowtype;
  v_owner_is_trainer boolean;
begin
  select owner_is_trainer into v_owner_is_trainer from organizations where id = v_org;
  select * into v_link from trainer_trainee_links where id = p_link_id for update;
  if v_link.id is null or v_link.trainee_id = v_link.trainer_id
     or not (v_link.trainer_id = v_uid or public.is_team_owner_of(v_link.trainer_id)) then
    raise exception 'link not found' using errcode = '42501';
  end if;
  if v_link.status not in ('invited', 'active', 'paused') then
    raise exception 'link not movable' using errcode = '22023';
  end if;
  if not ((p_to_trainer = v_uid and v_owner_is_trainer) or public.is_team_owner_of(p_to_trainer)) then
    raise exception 'trainer not in team' using errcode = '42501';
  end if;
  if p_to_trainer = v_link.trainer_id then
    return;
  end if;
  -- 担当先がそのクライアント本人（自分自身との契約になる）は不可
  if v_link.trainee_id = p_to_trainer then
    raise exception 'cannot assign to the trainee' using errcode = '22023';
  end if;
  update trainer_trainee_links set trainer_id = p_to_trainer where id = p_link_id;
  update coaching_plans set trainer_id = p_to_trainer, updated_at = now() where link_id = p_link_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_team(text)', 'rename_team(text)', 'reissue_team_invite()', 'join_team(text)',
    'decide_team_member(uuid, boolean)', 'remove_team_member(uuid)', 'leave_team()',
    'set_team_owner_is_trainer(boolean)', 'reassign_trainee_link(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 閲覧の権限（SELECT ポリシー）
-- ---------------------------------------------------------------------------

drop policy "trainer_trainee_links: trainer or trainee" on public.trainer_trainee_links;
create policy "trainer_trainee_links: trainer, trainee or team owner" on public.trainer_trainee_links
  for select using (trainer_id = auth.uid() or trainee_id = auth.uid() or public.is_team_owner_of(trainer_id));

drop policy "trainer_invites: trainer of the link" on public.trainer_invites;
create policy "trainer_invites: trainer of the link or team owner" on public.trainer_invites
  for select using (
    exists (
      select 1 from public.trainer_trainee_links l
      where l.id = link_id and (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
    )
  );

-- 担当替え・チームのテンプレートで、別のトレーナーの独自種目がプランに入ることがあるため、
-- 読めるプランに使われている独自種目も読めるようにする
drop policy "trainer_exercises: owner or active trainee" on public.trainer_exercises;
create policy "trainer_exercises: owner, active trainee or used in a readable plan" on public.trainer_exercises
  for select using (
    trainer_id = auth.uid()
    or exists (
      select 1 from public.trainer_trainee_links l
      where l.trainer_id = trainer_exercises.trainer_id and l.trainee_id = auth.uid() and l.status = 'active'
    )
    or exists (
      select 1 from public.plan_exercises pe
      join public.plan_days d on d.id = pe.plan_day_id
      where pe.trainer_exercise_id = trainer_exercises.id and public.can_read_plan(d.plan_id)
    )
  );

drop policy "organization_memberships: own or org owner" on public.organization_memberships;
create policy "organization_memberships: own, org owner or teammate" on public.organization_memberships
  for select using (trainer_id = auth.uid() or public.is_org_owner(organization_id) or public.is_approved_org_member(organization_id));

drop policy "trainer_profiles: self, own trainees, org owner" on public.trainer_profiles;
create policy "trainer_profiles: self, own trainees, org owner, teammate" on public.trainer_profiles
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trainer_trainee_links l
      where l.trainer_id = trainer_profiles.user_id and l.trainee_id = auth.uid() and l.status in ('active', 'paused')
    )
    or public.is_org_owner_of_trainer(user_id)
    or public.is_teammate(user_id)
  );

-- ---------------------------------------------------------------------------
-- 既存の関数の変更（今の定義に、チームの管理者・メンバーの条件を足したもの）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_trainer_view(p_trainee uuid, p_trained_on date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from trainer_trainee_links l
    where (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.started_at::date <= p_trained_on
      and (
        l.status = 'active'
        or (l.status = 'ended' and p_trained_on <= l.ended_at::date)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_trainee_record_access(p_trainee uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from trainer_trainee_links l
    where (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.status in ('active', 'ended')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_active_trainer_of(p_trainee uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from trainer_trainee_links l
    where (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_plan(p_plan_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from coaching_plans p
    left join trainer_trainee_links l on l.id = p.link_id
    where p.id = p_plan_id
      and (
        p.trainer_id = auth.uid()
        -- チームの管理者は、メンバーのプラン・テンプレートを見られる。メンバーは管理者のテンプレートを見られる（2026-10-26）
        or public.is_team_owner_of(p.trainer_id)
        or (p.link_id is null and public.is_team_member_of_owner(p.trainer_id))
        or (
          l.trainee_id = auth.uid()
          and l.status = 'active'
          and p.status in ('shared', 'active')
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.add_trainee_with_plan(p_display_name text, p_template_id uuid, p_one_rms jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_usable_template(p_template_id);
  v_name text := btrim(p_display_name);
  v_link uuid;
  v_plan uuid;
  v_day uuid;
  v_ex uuid;
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
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
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, sort_order, note)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.sort_order, r_ex.note)
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

  v_code := public.new_invite_code();
  insert into trainer_invites (link_id, code, expires_at) values (v_link, v_code, v_expires);

  return jsonb_build_object('link_id', v_link, 'plan_id', v_plan, 'code', v_code, 'expires_at', v_expires);
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_self_plan(p_template_id uuid, p_one_rms jsonb, p_start_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_usable_template(p_template_id);
  v_link uuid;
  v_plan uuid;
  v_day uuid;
  v_ex uuid;
  r_day record;
  r_ex record;
begin
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(v_uid);
  if p_start_date is not null and (p_start_date < current_date - 365 or p_start_date > current_date + 365) then
    raise exception 'start date out of range' using errcode = '22023';
  end if;

  select id into v_link from trainer_trainee_links
  where trainer_id = v_uid and trainee_id = v_uid
  for update;
  if not found then
    raise exception 'self link not found' using errcode = '42501';
  end if;

  -- 進行中のプランは1つ: 今のプランは終了する（記録は残る）
  update coaching_plans set status = 'ended', updated_at = now()
  where link_id = v_link and status in ('shared', 'active');

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id, generation_inputs, shared_at, start_date)
  select v_uid, v_link, name, total_weeks, 'shared', 'template', id,
         coalesce(generation_inputs, '{}'::jsonb) || jsonb_build_object('one_rms', coalesce(p_one_rms, '[]'::jsonb)), now(),
         coalesce(p_start_date, current_date)
  from coaching_plans where id = p_template_id
  returning id into v_plan;

  -- 複製は add_trainee_with_plan と同じ（%1RM のセットは、入力した1RMがあれば kg を入れる）
  for r_day in select * from plan_days where plan_id = p_template_id loop
    insert into plan_days (plan_id, week_number, day_number, label)
    values (v_plan, r_day.week_number, r_day.day_number, r_day.label)
    returning id into v_day;

    for r_ex in select * from plan_exercises where plan_day_id = r_day.id loop
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, sort_order, note)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.sort_order, r_ex.note)
      returning id into v_ex;

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

  return v_plan;
end;
$function$;

drop function public.trainer_trainee_activity(date);
CREATE OR REPLACE FUNCTION public.trainer_trainee_activity(p_since date, p_trainer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with trainees as (
    select distinct trainee_id as user_id from trainer_trainee_links
    -- p_trainer: チームの管理者がメンバーの分を見る時（読めるかは RLS が判定する、2026-10-26）
    where trainer_id = coalesce(p_trainer, auth.uid()) and trainee_id is not null
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
$function$;
revoke execute on function public.trainer_trainee_activity(date, uuid) from public, anon;
grant execute on function public.trainer_trainee_activity(date, uuid) to authenticated;

commit;
