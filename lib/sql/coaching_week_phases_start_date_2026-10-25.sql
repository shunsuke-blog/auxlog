-- コーチングプランの「今週の目的」と開始日（2026-10-25）
--
-- 1. 週ごとのフェーズ（V＝ボリューム期・I＝強度期・D＝回復週・M＝MaxOut）を generation_inputs.week_phases に持つ。
--    「Auxlogで作成」が作る時に入れる（API側）。トレーニーに共有する時はテンプレートの条件を引き継ぐ。
--    既に Auxlogで作成したテンプレートと、そこから共有したプランには、週数から同じ規則（planWeeks）で埋める。
--    白紙から作成したものは無し（今週の目的を表示しない）。
-- 2. coaching_plans.start_date: トレーニーが招待コードを入力する時に選ぶ開始日（過去の日付も可）。
--    ホームの「◯月◯日〜◯月◯日」の表示に使う。

begin;

alter table public.coaching_plans add column start_date date;

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


-- 招待コードを入力する（トレーニー側）。契約を開始し、セルフモードのプログラムを終了する。
create or replace function public.redeem_trainer_invite(p_code text, p_start_date date default null)
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
  if p_start_date is not null and (p_start_date < current_date - 365 or p_start_date > current_date + 365) then
    raise exception 'start date out of range' using errcode = '22023';
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
  -- トレーニーが選んだ開始日（過去の日付も可）。週の日付の表示に使う（2026-10-25）
  update coaching_plans set start_date = coalesce(p_start_date, current_date), updated_at = now()
  where link_id = v_link.id and status in ('shared', 'active');
  -- 同時に進められるプログラムは1つ: セルフモードのプログラムを終了する（記録は残る）
  update user_program_enrollments set is_active = false where user_id = v_uid and is_active;

  return v_link.id;
end;
$$;


drop function if exists public.redeem_trainer_invite(text);
-- （上の create or replace で引数を足した新しい関数ができている。旧い1引数の関数は drop した）

-- 既存の「Auxlogで作成」のテンプレート（作成条件に時間がある＝自動生成）に週ごとのフェーズを埋める
update public.coaching_plans
set generation_inputs = generation_inputs || jsonb_build_object('week_phases', case total_weeks
      when 1 then '["V"]'::jsonb
      when 2 then '["V","I"]'::jsonb
      when 3 then '["V","V","I"]'::jsonb
      when 4 then '["V","V","I","M"]'::jsonb
      when 5 then '["V","V","I","I","M"]'::jsonb
      when 6 then '["V","V","I","I","D","M"]'::jsonb
      when 7 then '["V","V","V","I","I","D","M"]'::jsonb
      when 8 then '["V","V","V","I","I","I","D","M"]'::jsonb
      when 9 then '["V","V","V","V","I","I","I","D","M"]'::jsonb
      when 10 then '["V","V","V","V","D","I","I","I","D","M"]'::jsonb
      when 11 then '["V","V","V","V","D","V","I","I","I","D","M"]'::jsonb
      when 12 then '["V","V","V","V","V","D","I","I","I","I","D","M"]'::jsonb
      when 13 then '["V","V","V","V","V","D","V","I","I","I","I","D","M"]'::jsonb
      when 14 then '["V","V","V","V","V","V","D","I","I","I","I","I","D","M"]'::jsonb
      when 15 then '["V","V","V","V","V","V","D","V","I","I","I","I","I","D","M"]'::jsonb
      when 16 then '["V","V","V","V","V","V","V","D","I","I","I","I","I","I","D","M"]'::jsonb
    end)
where link_id is null and generation_inputs ? 'session_minutes' and not generation_inputs ? 'week_phases'
  and total_weeks between 1 and 16;

-- そこから共有したトレーニーのプラン
update public.coaching_plans p
set generation_inputs = coalesce(p.generation_inputs, '{}'::jsonb) || jsonb_build_object('week_phases', t.generation_inputs->'week_phases')
from public.coaching_plans t
where t.id = p.based_on_plan_id and p.link_id is not null
  and t.generation_inputs ? 'week_phases' and not coalesce(p.generation_inputs, '{}'::jsonb) ? 'week_phases'
  and t.total_weeks = p.total_weeks;

revoke execute on function public.redeem_trainer_invite(text, date) from public, anon;
grant execute on function public.redeem_trainer_invite(text, date) to authenticated;

commit;
