-- トレーナーのプログラムに有酸素運動を入れる（2026-10-26）
--
-- プログラムの種目（plan_exercises）は、一覧の種目・独自種目に加えて有酸素の一覧（cardio_master）も指せるようにする。
-- 有酸素の種目はセット（plan_sets）を持たず、種目に目標の時間（必須）・距離（任意）を持つ。
-- 独自種目（trainer_exercises）も部位に 'cardio' を入れれば有酸素として扱う（target_muscle に制約は無い）。
-- テンプレートの複製・クライアントへの割り当て・Day の保存・クライアント側の種目の作成で、新しい列を引き継ぐ。
-- 前提: lib/sql/cardio_2026-10-26.sql（cardio_master）

begin;

alter table public.plan_exercises
  add column cardio_master_id uuid references public.cardio_master(id),
  add column target_duration_seconds integer,
  add column target_distance_km numeric(6, 2),
  drop constraint if exists plan_exercises_check,
  add constraint plan_exercises_one_exercise check (num_nonnulls(exercise_master_id, trainer_exercise_id, cardio_master_id) = 1),
  add constraint plan_exercises_target_duration_range check (target_duration_seconds is null or target_duration_seconds between 60 and 86400),
  add constraint plan_exercises_target_distance_range check (target_distance_km is null or (target_distance_km > 0 and target_distance_km <= 1000)),
  add constraint plan_exercises_target_distance_needs_duration check (target_distance_km is null or target_duration_seconds is not null);

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
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, cardio_master_id, sort_order, note, target_duration_seconds, target_distance_km)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.cardio_master_id, r_ex.sort_order, r_ex.note, r_ex.target_duration_seconds, r_ex.target_distance_km)
      returning id into v_ex;

      insert into plan_sets (plan_exercise_id, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, updated_by)
      select v_ex, set_number, target_weight_kg, target_pct_1rm, target_reps, target_rir, is_warmup, v_uid
      from plan_sets where plan_exercise_id = r_ex.id;
    end loop;
  end loop;

  return v_plan;
end;
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
      insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, cardio_master_id, sort_order, note, target_duration_seconds, target_distance_km)
      values (v_day, r_ex.exercise_master_id, r_ex.trainer_exercise_id, r_ex.cardio_master_id, r_ex.sort_order, r_ex.note, r_ex.target_duration_seconds, r_ex.target_distance_km)
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

    -- 有酸素（cardio_master_id、または部位が有酸素の独自種目）は、セットの代わりに目標の時間・距離を持つ（2026-10-26）
    insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, cardio_master_id, sort_order, note, target_duration_seconds, target_distance_km)
    values (
      p_plan_day_id,
      nullif(r_ex->>'exercise_master_id', '')::uuid,
      v_trainer_ex,
      nullif(r_ex->>'cardio_master_id', '')::uuid,
      v_idx,
      nullif(btrim(r_ex->>'note'), ''),
      nullif(r_ex->>'target_duration_seconds', '')::integer,
      nullif(r_ex->>'target_distance_km', '')::numeric
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

CREATE OR REPLACE FUNCTION public.ensure_plan_user_exercise(p_plan_exercise_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_te trainer_exercises%rowtype;
  v_ue uuid;
  v_sort int;
begin
  -- 同じ人・同じ種目の同時実行を直列化する（記録を同時に保存すると種目が2行できうるため、M3）
  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || coalesce(v_pe.exercise_master_id, v_pe.trainer_exercise_id, v_pe.cardio_master_id)::text, 0));
  select coalesce(max(sort_order), 0) + 1 into v_sort from user_exercises where user_id = v_uid;

  if v_pe.exercise_master_id is not null then
    select id into v_ue from user_exercises
    where user_id = v_uid and exercise_master_id = v_pe.exercise_master_id
    order by is_active desc, created_at
    limit 1;
    if v_ue is null then
      insert into user_exercises (user_id, exercise_master_id, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound)
      select v_uid, m.id, 3, 10, v_sort, true, coalesce(m.is_bodyweight, false), m.is_compound
      from exercise_master m where m.id = v_pe.exercise_master_id
      returning id into v_ue;
    end if;
  elsif v_pe.cardio_master_id is not null then
    -- 有酸素の一覧の種目（2026-10-26）。クライアントが自分で追加した時と同じ形（custom_name・custom_target_muscle = 'cardio'）
    select id into v_ue from user_exercises
    where user_id = v_uid and cardio_master_id = v_pe.cardio_master_id
    order by is_active desc, created_at
    limit 1;
    if v_ue is null then
      insert into user_exercises (user_id, cardio_master_id, custom_name, custom_target_muscle, default_sets, default_reps, sort_order, is_active)
      select v_uid, c.id, c.name, 'cardio', 1, 1, v_sort, true
      from cardio_master c where c.id = v_pe.cardio_master_id
      returning id into v_ue;
    end if;
  else
    select * into v_te from trainer_exercises where id = v_pe.trainer_exercise_id;
    select id into v_ue from user_exercises
    where user_id = v_uid and trainer_exercise_id = v_te.id;
    if v_ue is null then
      insert into user_exercises (user_id, custom_name, custom_target_muscle, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound, trainer_exercise_id)
      values (v_uid, v_te.name, v_te.target_muscle, 3, 10, v_sort, true, v_te.is_bodyweight, v_te.is_compound, v_te.id)
      returning id into v_ue;
    end if;
  end if;

  update user_exercises set is_active = true where id = v_ue and not is_active;
  return v_ue;
end;
$function$;

commit;
