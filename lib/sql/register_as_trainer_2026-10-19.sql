-- トレーナー登録のRPC（ロードマップ④、2026-10-19）
--
-- trainer_profiles の作成と、トレーナー自身との契約（trainer_id = trainee_id）の作成を
-- 1トランザクションで行う。新規テーブルはクライアントの書き込み権限が無いため SECURITY DEFINER で
-- 実行し、対象は必ず auth.uid() 本人に限定する。呼び出しは app/api/trainer/register/route.ts から。
-- 既に登録済みなら表示名だけ更新する（二重送信・再登録でも壊れない）。

create or replace function public.register_as_trainer(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_display_name);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'display name must be 1-40 characters' using errcode = '22023';
  end if;
  -- ジム経営者はトレーナー・トレーニーと完全に別のアカウント（要件定義「アカウント種別」）
  if exists (select 1 from users where id = v_uid and account_type = 'gym_owner') then
    raise exception 'gym owner accounts cannot register as trainers' using errcode = '42501';
  end if;

  insert into trainer_profiles (user_id, display_name)
  values (v_uid, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name;

  -- 自分自身との契約。トレーニー一覧の一番上に出し、自分のトレーニングはここから開く。
  insert into trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
  select v_uid, v_uid, v_name, 'active', now()
  where not exists (
    select 1 from trainer_trainee_links where trainer_id = v_uid and trainee_id = v_uid
  );
end;
$$;

revoke execute on function public.register_as_trainer(text) from public, anon;
grant execute on function public.register_as_trainer(text) to authenticated;
