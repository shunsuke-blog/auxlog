-- トレーナーの課金（Stripe、2026-10-26）。プロ ¥9,800/月（税込）を Stripe Checkout で申し込み、
-- Webhook（app/api/webhooks/stripe）が trainer_profiles.plan を pro / starter に切り替える。
-- ビジネスは当面「お問い合わせ」（チーム機能ができるまで販売しない）。
--
-- 1. trainer_profiles に Stripe の顧客・サブスクの情報を持つ（書き込みは Webhook のサービスロールだけ。
--    authenticated は今までどおり SELECT のみ）
-- 2. 上限を超えている間のロック（2026-10-26 オーナー決定）: 有料プランをやめてクライアントが上限より
--    多くなった時、今の契約・クライアントの記録は続くが、トレーナーはテンプレートの作成・編集・複製、
--    招待コードの再発行、自分へのプログラムの割り当てができない（閲覧・契約の終了・名前の変更はできる）。
--    契約を終了して上限内に戻すか、有料プランに戻すと解除される。
--    （「30人と契約してから解約すれば無料で30人を管理できる」抜け道を塞ぐ）

begin;

-- 1. Stripe の情報
alter table public.trainer_profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- 2. 上限の判定（数え方は add_trainee_with_plan と同じ: 招待中・契約中・一時停止中、自分は除く）
create or replace function public.trainer_over_limit(p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*) from trainer_trainee_links
    where trainer_id = p_trainer
      and trainee_id is distinct from trainer_id
      and status in ('invited', 'active', 'paused')
  ) > public.trainer_trainee_limit(p_trainer);
$$;

revoke execute on function public.trainer_over_limit(uuid) from public, anon, authenticated;

create or replace function public.assert_trainer_within_limit(p_trainer uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.trainer_over_limit(p_trainer) then
    raise exception 'over trainee limit' using errcode = 'P0001', hint = 'over_limit';
  end if;
end;
$$;

revoke execute on function public.assert_trainer_within_limit(uuid) from public, anon, authenticated;

-- 上限を超えている間に止める操作（今の定義に、上のチェックを1行足したもの）
CREATE OR REPLACE FUNCTION public.create_plan_template(p_name text, p_total_weeks integer, p_days_per_week integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_trainer();
  v_name text := btrim(p_name);
  v_plan uuid;
begin
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(v_uid);
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;
  if p_total_weeks is null or p_total_weeks < 1 or p_total_weeks > 16 then
    raise exception 'total_weeks must be 1-16' using errcode = '22023';
  end if;
  if p_days_per_week is null or p_days_per_week < 1 or p_days_per_week > 7 then
    raise exception 'days_per_week must be 1-7' using errcode = '22023';
  end if;

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source)
  values (v_uid, null, v_name, p_total_weeks, 'draft', 'blank')
  returning id into v_plan;

  insert into plan_days (plan_id, week_number, day_number)
  select v_plan, w, d
  from generate_series(1, p_total_weeks) as w, generate_series(1, p_days_per_week) as d;

  return v_plan;
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicate_plan_template(p_plan_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_own_template(p_plan_id);
  v_name text := btrim(p_name);
  v_plan uuid;
  r_day record;
  r_ex record;
  v_day uuid;
  v_ex uuid;
begin
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(v_uid);
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id, generation_inputs)
  select v_uid, null, v_name, total_weeks, 'draft', 'template', id, generation_inputs
  from coaching_plans where id = p_plan_id
  returning id into v_plan;

  for r_day in select * from plan_days where plan_id = p_plan_id loop
    insert into plan_days (plan_id, week_number, day_number, label)
    values (v_plan, r_day.week_number, r_day.day_number, r_day.label)
    returning id into v_day;

    for r_ex in select * from plan_exercises where plan_day_id = r_day.id loop
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, sort_order, note)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.sort_order, r_ex.note)
      returning id into v_ex;

      insert into plan_sets (plan_exercise_id, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, updated_by)
      select v_ex, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, v_uid
      from plan_sets where plan_exercise_id = r_ex.id;
    end loop;
  end loop;

  return v_plan;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reissue_trainee_invite(p_link_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_trainer();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(v_uid);
  if not exists (select 1 from trainer_trainee_links where id = p_link_id and trainer_id = v_uid and status = 'invited') then
    raise exception 'invite not found' using errcode = '42501';
  end if;
  update trainer_invites set revoked_at = now() where link_id = p_link_id and used_at is null and revoked_at is null;
  v_code := public.new_invite_code();
  insert into trainer_invites (link_id, code, expires_at) values (p_link_id, v_code, v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_self_plan(p_template_id uuid, p_one_rms jsonb, p_start_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_own_template(p_template_id);
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

CREATE OR REPLACE FUNCTION public.rename_plan_template(p_plan_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(p_name);
begin
  perform public.assert_own_template(p_plan_id);
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(auth.uid());
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;
  update coaching_plans set name = v_name, updated_at = now() where id = p_plan_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_template_day(p_plan_day_id uuid, p_exercises jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_plan uuid;
  r_ex jsonb;
  r_set jsonb;
  v_ex uuid;
  v_idx int := 0;
  v_set_no int;
  v_trainer_ex uuid;
begin
  select plan_id into v_plan from plan_days where id = p_plan_day_id;
  if v_plan is null then
    raise exception 'day not found' using errcode = '42501';
  end if;
  v_uid := public.assert_own_template(v_plan);
  -- 上限を超えている間（有料プランをやめた後など）は止める（2026-10-26）
  perform public.assert_trainer_within_limit(v_uid);
  if jsonb_typeof(coalesce(p_exercises, '[]'::jsonb)) <> 'array' then
    raise exception 'exercises must be an array' using errcode = '22023';
  end if;

  delete from plan_exercises where plan_day_id = p_plan_day_id;

  for r_ex in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb)) loop
    v_idx := v_idx + 1;
    v_trainer_ex := nullif(r_ex->>'trainer_exercise_id', '')::uuid;
    -- 独自種目は自分のものだけ使える
    if v_trainer_ex is not null and not exists (
      select 1 from trainer_exercises where id = v_trainer_ex and trainer_id = v_uid
    ) then
      raise exception 'trainer exercise not found' using errcode = '42501';
    end if;

    insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, sort_order, note)
    values (
      p_plan_day_id,
      nullif(r_ex->>'exercise_master_id', '')::uuid,
      v_trainer_ex,
      v_idx,
      nullif(btrim(r_ex->>'note'), '')
    )
    returning id into v_ex;

    v_set_no := 0;
    for r_set in select * from jsonb_array_elements(coalesce(r_ex->'sets', '[]'::jsonb)) loop
      v_set_no := v_set_no + 1;
      insert into plan_sets (plan_exercise_id, set_number, target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup, updated_by)
      values (
        v_ex,
        v_set_no,
        nullif(r_set->>'target_pct_1rm', '')::numeric,
        nullif(r_set->>'target_weight_kg', '')::numeric,
        (r_set->>'target_reps')::smallint,
        nullif(r_set->>'target_rir', '')::smallint,
        coalesce((r_set->>'is_warmup')::boolean, false),
        v_uid
      );
    end loop;
  end loop;

  update coaching_plans set updated_at = now() where id = v_plan;
end;
$function$;

commit;
