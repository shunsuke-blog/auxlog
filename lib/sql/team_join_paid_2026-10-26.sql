-- 有料プランのトレーナーもチームに参加を申請できるようにする（2026-10-26 オーナー決定）。
-- 管理者が承認した時に、メンバー自身のプロプランを「今の期間の終わりで解約」にする（返金なし。
-- /api/trainer/team の decide で Stripe を呼ぶ）。承認された時からチームのビジネスプランで使える。
-- 自分でビジネスプランを契約している人は、自分のチームを作る側なので、これまでどおり参加できない。

begin;

create or replace function public.join_team(p_code text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    where user_id = v_uid and plan = 'business'
      and subscription_status in ('active', 'trialing', 'past_due') and not cancel_at_period_end
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
$function$;

commit;
