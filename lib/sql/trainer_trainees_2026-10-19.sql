-- トレーニーの追加・招待コード・契約終了（ロードマップ④の一覧タブ、2026-10-19）
--
-- 決定事項（要件定義）:
--   - 追加ボタン → 共有するテンプレートを選ぶ → 招待コードを発行（コードはトレーニーごとに使い捨て・7日間有効）
--   - テンプレートは%1RMで持ち、追加時に入力した1RMから kg を入れる（重量は2.5kg単位に丸める、エンジンと同じ）
--   - 無料枠はトレーニー3人まで。人数にトレーナー自身は含めず、招待中・一時停止中は含める。
--     上限に達したら新しく招待できない（課金⑥ができるまでは常に3人が上限）
--   - コードを入力したら、そのトレーニーのセルフモードのプログラムは終了する
--   - 契約はトレーナー・トレーニーのどちらからでも終了できる。終了するとプランも終了する
-- 書き込みはすべて SECURITY DEFINER の RPC で、関数内で本人確認をする（権限チェックの方式）。

begin;

-- 無料段階の上限（トレーナー自身を除く、招待中・一時停止中を含む）。課金（⑥）で段階ごとの上限に置き換える。
create or replace function public.trainer_trainee_limit(p_trainer uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select 3;
$$;

-- 読み間違えやすい文字（0/O, 1/I/L）を除いた8文字の招待コード
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from trainer_invites where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- トレーニーを追加する: 契約（招待中）を作り、テンプレートを複製して1RMから kg を入れ、招待コードを発行する。
-- p_one_rms: [{ "exercise_master_id" | "trainer_exercise_id": uuid, "one_rm_kg": number }]
create or replace function public.add_trainee_with_plan(p_display_name text, p_template_id uuid, p_one_rms jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_own_template(p_template_id);
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

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id, generation_inputs, shared_at)
  select v_uid, v_link, name, total_weeks, 'shared', 'template', id,
         jsonb_build_object('one_rms', coalesce(p_one_rms, '[]'::jsonb)), now()
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
            then round(s.target_pct_1rm * rm.one_rm_kg / 2.5) * 2.5 end
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
$$;

-- 招待コードの再発行（期限切れ・紛失時）。未使用の古いコードは無効にする。
create or replace function public.reissue_trainee_invite(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  if not exists (select 1 from trainer_trainee_links where id = p_link_id and trainer_id = v_uid and status = 'invited') then
    raise exception 'invite not found' using errcode = '42501';
  end if;
  update trainer_invites set revoked_at = now() where link_id = p_link_id and used_at is null and revoked_at is null;
  v_code := public.new_invite_code();
  insert into trainer_invites (link_id, code, expires_at) values (p_link_id, v_code, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- 招待コードを入力する（トレーニー側）。契約を開始し、セルフモードのプログラムを終了する。
create or replace function public.redeem_trainer_invite(p_code text)
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
  if exists (select 1 from users where id = v_uid and account_type = 'gym_owner') then
    raise exception 'gym owner accounts cannot be trainees' using errcode = '42501';
  end if;

  select * into v_invite from trainer_invites
  where code = upper(btrim(p_code)) and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invalid or expired code' using errcode = 'P0001', hint = 'invalid_code';
  end if;

  select * into v_link from trainer_trainee_links where id = v_invite.link_id for update;
  if v_link.status <> 'invited' then
    raise exception 'invalid or expired code' using errcode = 'P0001', hint = 'invalid_code';
  end if;
  if v_link.trainer_id = v_uid then
    raise exception 'cannot redeem own invite' using errcode = 'P0001', hint = 'own_invite';
  end if;
  if exists (
    select 1 from trainer_trainee_links
    where trainee_id = v_uid and trainer_id <> v_uid and status in ('active', 'paused')
  ) then
    raise exception 'already has a trainer' using errcode = 'P0001', hint = 'already_linked';
  end if;

  update trainer_trainee_links set trainee_id = v_uid, status = 'active', started_at = now() where id = v_link.id;
  update trainer_invites set used_at = now() where id = v_invite.id;
  -- 同時に進められるプログラムは1つ: セルフモードのプログラムを終了する（記録は残る）
  update user_program_enrollments set is_active = false where user_id = v_uid and is_active;

  return v_link.id;
end;
$$;

-- 契約を終了する（トレーナー・トレーニーのどちらからでも）。招待中（まだコード未入力）なら取り消し＝削除。
create or replace function public.end_trainer_contract(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_link trainer_trainee_links%rowtype;
begin
  select * into v_link from trainer_trainee_links where id = p_link_id for update;
  if not found or v_uid is null or (v_link.trainer_id <> v_uid and v_link.trainee_id is distinct from v_uid) then
    raise exception 'contract not found' using errcode = '42501';
  end if;
  if v_link.trainer_id = v_link.trainee_id then
    raise exception 'cannot end self link' using errcode = '22023';
  end if;

  if v_link.status = 'invited' then
    if v_link.trainer_id <> v_uid then
      raise exception 'contract not found' using errcode = '42501';
    end if;
    delete from trainer_trainee_links where id = p_link_id;
    return;
  end if;
  if v_link.status = 'ended' then
    return;
  end if;

  update trainer_trainee_links set status = 'ended', ended_at = now() where id = p_link_id;
  update coaching_plans set status = 'ended', updated_at = now() where link_id = p_link_id and status in ('shared', 'active');
end;
$$;

revoke execute on function public.trainer_trainee_limit(uuid) from public, anon, authenticated;
revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.add_trainee_with_plan(text, uuid, jsonb) from public, anon;
revoke execute on function public.reissue_trainee_invite(uuid) from public, anon;
revoke execute on function public.redeem_trainer_invite(text) from public, anon;
revoke execute on function public.end_trainer_contract(uuid) from public, anon;
grant execute on function public.add_trainee_with_plan(text, uuid, jsonb) to authenticated;
grant execute on function public.reissue_trainee_invite(uuid) to authenticated;
grant execute on function public.redeem_trainer_invite(text) to authenticated;
grant execute on function public.end_trainer_contract(uuid) to authenticated;

commit;
