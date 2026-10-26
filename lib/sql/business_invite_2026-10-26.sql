-- ビジネスプランはお問い合わせ制（2026-10-26 オーナー決定）。
-- 話がまとまったら、運営が相手のメールアドレス宛ての「管理者用の登録ページ」（/trainer/business/<token>）を発行して送る。
-- そのメールアドレスでログイン（未登録ならトレーナー登録）してページを開くと、ビジネスの申し込みが許可され
-- （trainer_profiles.business_allowed）、設定画面から Stripe でビジネスを申し込めるようになる。
-- アカウントがすでにある人も同じページで許可できる（直接 business_allowed を立ててもよい）。
--
-- 発行は運営が SQL で行う: select public.create_business_invite('example@example.com');  → token を返す

begin;

alter table public.trainer_profiles add column if not exists business_allowed boolean not null default false;

create table if not exists public.business_invites (
  id uuid default gen_random_uuid() primary key,
  token text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references public.users(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
-- クライアントからは読み書きさせない（ポリシー無し・権限剥奪。使うのは下の関数だけ）
alter table public.business_invites enable row level security;
revoke all on public.business_invites from anon, authenticated;

-- 運営用: 発行（authenticated からは呼べない）
create or replace function public.create_business_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'email required' using errcode = '22023';
  end if;
  insert into business_invites (token, email) values (v_token, lower(btrim(p_email)));
  return v_token;
end;
$$;
revoke execute on function public.create_business_invite(text) from public, anon, authenticated;

-- 登録ページを開いた時: 宛先のメールアドレスでログインしたトレーナーに、ビジネスの申し込みを許可する。
-- 戻り値: 'ok'（許可した・許可済み）。宛先違いは例外（hint で理由）
create or replace function public.redeem_business_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_email text := lower((select email from auth.users where id = v_uid));
  v_invite business_invites%rowtype;
begin
  select * into v_invite from business_invites where token = p_token for update;
  if v_invite.id is null or v_invite.revoked_at is not null then
    raise exception 'invite not found' using errcode = 'P0001', hint = 'business_invite_invalid';
  end if;
  -- 使用済み: 同じ人なら何もしない（ページを開き直した時）
  if v_invite.used_by is not null then
    if v_invite.used_by = v_uid then return 'ok'; end if;
    raise exception 'invite already used' using errcode = 'P0001', hint = 'business_invite_invalid';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite expired' using errcode = 'P0001', hint = 'business_invite_expired';
  end if;
  if v_email is distinct from v_invite.email then
    raise exception 'email mismatch' using errcode = 'P0001', hint = 'business_invite_email';
  end if;
  update business_invites set used_by = v_uid, used_at = now() where id = v_invite.id;
  update trainer_profiles set business_allowed = true where user_id = v_uid;
  return 'ok';
end;
$$;
revoke execute on function public.redeem_business_invite(text) from public, anon;
grant execute on function public.redeem_business_invite(text) to authenticated;

commit;
