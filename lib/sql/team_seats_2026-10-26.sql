-- チームのトレーナー枠を増やせるようにする（2026-10-26 オーナー指摘）。
-- ビジネスプランはトレーナー3名まで。4名以上はご相談のうえ追加料金で増やせる（extra_trainer_seats、運営が設定）:
--   update organizations set extra_trainer_seats = 1 where owner_user_id = '...';
-- あわせて、チームを作る時に「自分もクライアントを担当するか」を選べるようにする（create_team の引数）。
-- 管理者用の登録ページは「プランを申し込む → チームを作る（担当するかを選ぶ）」の順にする。

begin;

alter table public.organizations add column if not exists extra_trainer_seats int not null default 0 check (extra_trainer_seats >= 0);

-- チームのトレーナー枠（基本3名＋追加分）
create or replace function public.team_seat_limit(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select 3 + coalesce((select extra_trainer_seats from organizations where id = p_org), 0);
$$;
revoke execute on function public.team_seat_limit(uuid) from public, anon, authenticated;

drop function public.create_team(text);
create or replace function public.create_team(p_name text, p_owner_is_trainer boolean default true)
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
    update organizations set name = v_name, owner_is_trainer = p_owner_is_trainer where id = v_org;
    return v_org;
  end if;
  insert into organizations (owner_user_id, name, owner_is_trainer) values (v_uid, v_name, p_owner_is_trainer) returning id into v_org;
  insert into organization_invites (organization_id, code) values (v_org, public.new_invite_code());
  return v_org;
end;
$$;

revoke execute on function public.create_team(text, boolean) from public, anon;
grant execute on function public.create_team(text, boolean) to authenticated;

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
  if p_approve and public.team_trainer_count(v_org) >= public.team_seat_limit(v_org) then
    raise exception 'team is full' using errcode = 'P0001', hint = 'team_full';
  end if;
  update organization_memberships
  set status = case when p_approve then 'approved' else 'rejected' end,
      approved_at = case when p_approve then now() end
  where id = p_membership_id;
end;
$$;

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
  if p_value and public.team_trainer_count(v_org) >= public.team_seat_limit(v_org) then
    raise exception 'team is full' using errcode = 'P0001', hint = 'team_full';
  end if;
  update organizations set owner_is_trainer = p_value where id = v_org;
end;
$$;

commit;
