-- トレーナーが自分自身にプログラムを割り当てる（2026-10-26 オーナー決定）。
-- クライアント一覧の自分の行の詳細から、テンプレートを選んで自分自身との契約（trainer_id = trainee_id）に複製する。
-- 割り当て中はトレーナーのトレーニー画面がコーチングモードになり、外す（終了する）とセルフモードに戻る。
-- セルフモードのプログラム（user_program_enrollments）は止めない（外した時にそのまま戻れるように）。
--
-- 1. assign_self_plan: 今の自分のプランを終了して、テンプレートを複製した新しいプランを始める
-- 2. end_self_plan: 自分のプランを終了する（セルフモードに戻る）
-- 3. advance_coaching_week / finish_coaching_plan: 自分自身との契約のプランも対象にする
--    （他のトレーナーと契約中なら、そちらを優先）

-- 1. 自分にテンプレートを割り当てる
create or replace function public.assign_self_plan(p_template_id uuid, p_one_rms jsonb, p_start_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_own_template(p_template_id);
  v_link uuid;
  v_plan uuid;
  v_day uuid;
  v_ex uuid;
  r_day record;
  r_ex record;
begin
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
$$;

revoke execute on function public.assign_self_plan(uuid, jsonb, date) from public, anon;
grant execute on function public.assign_self_plan(uuid, jsonb, date) to authenticated;

-- 2. 自分のプランを終了する
create or replace function public.end_self_plan()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
begin
  update coaching_plans p set status = 'ended', updated_at = now()
  from trainer_trainee_links l
  where l.id = p.link_id and l.trainer_id = v_uid and l.trainee_id = v_uid
    and p.status in ('shared', 'active');
end;
$$;

revoke execute on function public.end_self_plan() from public, anon;
grant execute on function public.end_self_plan() to authenticated;

-- 3. 週を進める・プランを終える: 自分自身との契約のプランも対象にする
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
  where l.trainee_id = v_uid and l.status = 'active'
    and p.status in ('shared', 'active')
  order by (l.trainer_id = v_uid)
  limit 1
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

create or replace function public.finish_coaching_plan()
returns void
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
  where l.trainee_id = v_uid and l.status = 'active'
    and p.status in ('shared', 'active')
  order by (l.trainer_id = v_uid)
  limit 1
  for update of p;
  if not found then
    raise exception 'no live plan' using errcode = '42501';
  end if;
  if v_plan.current_week < v_plan.total_weeks then
    raise exception 'not final week' using errcode = 'P0001', hint = 'not_final_week';
  end if;
  update coaching_plans set status = 'ended', updated_at = now() where id = v_plan.id;
end;
$$;
