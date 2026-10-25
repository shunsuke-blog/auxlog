-- コードレビューの指摘への対応（2026-10-25、DB側）。レビュー: https://claude.ai/artifact/M3FDB8hhK7Az5fFgZQdKV3
--
-- H2: 1RMの推定は API（lib/coaching/one_rm.ts、テストあり）で行い、DB関数は上限を確かめて書き込むだけにする
--     （推定ロジックの TS・SQL の重複も解消、M4）。推定1RM・入力1RMの上限はどちらも 500kg。
-- H3: 記録の重量 0〜500kg・回数 0〜200 を DB の制約にする（API を通さない書き込みも弾く）。
-- M1: 「次の週へ」は今の週を受け取り、その週の時だけ進める（二重送信で2週進まない）。
-- M3: トレーニーの種目の用意を、同じ人・同じ種目について直列化する。
-- L3: 記録の種目（exercise_id）は、記録の持ち主の種目に限る。
-- L5: プランの kg 指定は正の値に限る。
-- 既存データは適用前に確認済み（範囲外の記録 0件、正でない kg 0件、他人の種目を指す記録 0件）。

begin;

-- H3 ----------------------------------------------------------------------
alter table public.training_sets
  add constraint training_sets_weight_range check (weight_kg >= 0 and weight_kg <= 500),
  add constraint training_sets_reps_range check (reps >= 0 and reps <= 200);

-- L5 ----------------------------------------------------------------------
alter table public.plan_sets
  add constraint plan_sets_target_weight_positive check (target_weight_kg is null or target_weight_kg > 0);

-- 重量の丸め（2.5kg単位）。TS の roundToPlate（lib/coaching/one_rm.ts）と同じ
create or replace function public.round_to_plate(p_kg numeric)
returns numeric
language sql
immutable
as $$ select round(p_kg / 2.5) * 2.5 $$;

-- H2 / M4 -----------------------------------------------------------------
-- トレーニー追加時の kg の計算も同じ丸め関数を使う（2.5kg丸めの SQL の定義を1か所に）
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
$$;



drop function if exists public.fill_plan_weights_from_record(uuid);

-- 1RMを入れずに共有した種目の重量を、API が初回の記録から推定した1RMで入れる。
-- 重量が空の %1RM のセットだけに入れるので、2回目以降・同時実行は 0件（冪等）。1つのトランザクションで書く。
create or replace function public.fill_plan_weights(p_plan_exercise_id uuid, p_one_rm_kg numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_plan uuid;
  v_count int;
begin
  if p_one_rm_kg is null or p_one_rm_kg <= 0 or p_one_rm_kg > 500 then
    raise exception 'one_rm out of range' using errcode = '22023';
  end if;
  -- 推定の元になる記録が、本人がこの種目で付けたものとしてあること
  if not exists (
    select 1 from training_sets t join training_sessions s on s.id = t.session_id
    where t.plan_exercise_id = p_plan_exercise_id and s.user_id = v_uid
  ) then
    return 0;
  end if;

  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  select d.plan_id into v_plan from plan_days d where d.id = v_pe.plan_day_id;

  update plan_sets s
  set target_weight_kg = public.round_to_plate(s.target_pct_1rm * p_one_rm_kg), updated_at = now()
  from plan_exercises pe, plan_days d
  where pe.id = s.plan_exercise_id and d.id = pe.plan_day_id
    and d.plan_id = v_plan
    and pe.exercise_master_id is not distinct from v_pe.exercise_master_id
    and pe.trainer_exercise_id is not distinct from v_pe.trainer_exercise_id
    and s.target_pct_1rm is not null and s.target_weight_kg is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- M1 ----------------------------------------------------------------------
drop function if exists public.advance_coaching_week();

create or replace function public.advance_coaching_week(p_from_week smallint)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan coaching_plans%rowtype;
begin
  select p.* into v_plan
  from coaching_plans p
  join trainer_trainee_links l on l.id = p.link_id
  where l.trainee_id = v_uid and l.trainer_id <> v_uid and l.status = 'active'
    and p.status in ('shared', 'active')
  for update of p;
  if not found then
    raise exception 'no live plan' using errcode = '42501';
  end if;
  -- 二重送信: すでに進んでいれば何もせず今の週を返す
  if v_plan.current_week <> p_from_week then
    return v_plan.current_week;
  end if;
  if v_plan.current_week >= v_plan.total_weeks then
    raise exception 'already final week' using errcode = 'P0001', hint = 'final_week';
  end if;

  update coaching_plans
  set current_week = current_week + 1, current_week_started_at = now(), updated_at = now()
  where id = v_plan.id;
  return v_plan.current_week + 1;
end;
$$;

-- M3 ----------------------------------------------------------------------
create or replace function public.ensure_plan_user_exercise(p_plan_exercise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainee_plan_exercise(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_te trainer_exercises%rowtype;
  v_ue uuid;
  v_sort int;
begin
  -- 同じ人・同じ種目の同時実行を直列化する（記録を同時に保存すると種目が2行できうるため、M3）
  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || coalesce(v_pe.exercise_master_id, v_pe.trainer_exercise_id)::text, 0));
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
$$;


-- L3 ----------------------------------------------------------------------
create or replace function public.check_training_set_exercise_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from training_sessions s join user_exercises u on u.id = new.exercise_id
    where s.id = new.session_id and u.user_id = s.user_id
  ) then
    raise exception 'exercise % does not belong to the session owner', new.exercise_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger training_sets_check_exercise_owner
  before insert or update of exercise_id, session_id on public.training_sets
  for each row execute function public.check_training_set_exercise_owner();

revoke execute on function public.fill_plan_weights(uuid, numeric) from public, anon;
revoke execute on function public.advance_coaching_week(smallint) from public, anon;
grant execute on function public.fill_plan_weights(uuid, numeric) to authenticated;
grant execute on function public.advance_coaching_week(smallint) to authenticated;

commit;
