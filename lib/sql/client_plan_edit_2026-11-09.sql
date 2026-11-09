-- 契約中のクライアントのプランを途中で変える（2026-11-09 オーナー決定）。
--   例: 2週間やってみて「この種目が合わない」と言われた時に、残りの週の種目を入れ替える。
--   - 変えられるのは今の週から最後の週まで。今の週でも、記録した・スキップした種目はそのまま残す
--     （記録とプランの紐付け training_sets.plan_exercise_id と、今週の進み具合を守るため）
--   - 画面は「保存する」で反映する（オーナー決定: クライアントのメニューが変わるので、記録の修正と同じく押した時だけ）。
--     変えた Day をまとめて1回で保存する（途中で失敗しても半端に残らない）
--   - 種目を変えていない行は ID を残したまま更新する（クライアントがその種目の記録画面を開いていても保存できるように）
--   - %1RM のセットの重量（1RM から計算した kg、fill_plan_weights_from_record が入れた kg）は引き継ぐ。
--     同じ行・同じセット番号・同じ % なら元の kg、それ以外は同じプランの同じ種目の kg÷% から出した 1RM で計算する。
--     どちらも無ければ空のまま（初めての記録から入る、今までどおり）
--   権限は記録の代理入力と同じ: 担当トレーナーかチームの管理者、契約中（active）のクライアントだけ。

begin;

create or replace function public.replace_client_plan_days(p_plan_id uuid, p_days jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.assert_trainer();
  v_plan coaching_plans%rowtype;
  v_link trainer_trainee_links%rowtype;
  r_day jsonb;
  r_ex jsonb;
  r_set jsonb;
  v_day plan_days%rowtype;
  v_keep uuid[];
  v_pe plan_exercises%rowtype;
  v_pe_id uuid;
  v_ex uuid;
  v_idx int;
  v_set_no int;
  v_trainer_ex uuid;
  v_master uuid;
  v_cardio uuid;
  v_pct numeric;
  v_kg numeric;
  v_one_rm numeric;
begin
  select * into v_plan from coaching_plans where id = p_plan_id;
  if not found or v_plan.link_id is null then
    raise exception 'plan not found' using errcode = '42501';
  end if;
  select * into v_link from trainer_trainee_links where id = v_plan.link_id;
  if not (v_link.trainer_id = v_uid or public.is_team_owner_of(v_link.trainer_id))
     or v_link.trainee_id is null or v_link.trainee_id = v_link.trainer_id or v_link.status <> 'active' then
    raise exception 'plan not found' using errcode = '42501';
  end if;
  if v_plan.status not in ('shared', 'active') then
    raise exception 'plan is not live' using errcode = 'P0001', hint = 'plan_not_live';
  end if;
  if jsonb_typeof(coalesce(p_days, '[]'::jsonb)) <> 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;

  -- このプランの種目ごとの 1RM（%1RM のセットに入っている kg ÷ %）。消す前に読んでおく
  create temp table if not exists _client_plan_one_rm (exercise_master_id uuid, trainer_exercise_id uuid, one_rm numeric) on commit drop;
  delete from _client_plan_one_rm;
  insert into _client_plan_one_rm
  select pe.exercise_master_id, pe.trainer_exercise_id, max(s.target_weight_kg / s.target_pct_1rm)
  from plan_sets s join plan_exercises pe on pe.id = s.plan_exercise_id join plan_days d on d.id = pe.plan_day_id
  where d.plan_id = p_plan_id and s.target_pct_1rm > 0 and s.target_weight_kg is not null
  group by pe.exercise_master_id, pe.trainer_exercise_id;

  for r_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    select * into v_day from plan_days where id = nullif(r_day->>'plan_day_id', '')::uuid and plan_id = p_plan_id;
    if not found then
      raise exception 'day not found' using errcode = '42501';
    end if;
    if v_day.week_number < v_plan.current_week then
      raise exception 'past week' using errcode = 'P0001', hint = 'past_week';
    end if;

    -- 記録した・スキップした種目（変えない）
    select coalesce(array_agg(pe.id order by pe.sort_order), '{}') into v_keep
    from plan_exercises pe
    where pe.plan_day_id = v_day.id
      and (exists (select 1 from training_sets t where t.plan_exercise_id = pe.id)
        or exists (select 1 from plan_exercise_skips k where k.plan_exercise_id = pe.id));

    -- 送られてきた種目に無い行は消す（変えない種目は残す）
    delete from plan_exercises pe
    where pe.plan_day_id = v_day.id
      and pe.id <> all (v_keep)
      and pe.id not in (
        select nullif(x->>'plan_exercise_id', '')::uuid from jsonb_array_elements(coalesce(r_day->'exercises', '[]'::jsonb)) x
        where nullif(x->>'plan_exercise_id', '') is not null
      );

    -- 変えない種目を先に、その後に送られてきた順
    v_idx := 0;
    for v_pe_id in select unnest(v_keep) loop
      v_idx := v_idx + 1;
      update plan_exercises set sort_order = v_idx where id = v_pe_id;
    end loop;

    for r_ex in select * from jsonb_array_elements(coalesce(r_day->'exercises', '[]'::jsonb)) loop
      v_master := nullif(r_ex->>'exercise_master_id', '')::uuid;
      v_trainer_ex := nullif(r_ex->>'trainer_exercise_id', '')::uuid;
      v_cardio := nullif(r_ex->>'cardio_master_id', '')::uuid;
      v_pe_id := nullif(r_ex->>'plan_exercise_id', '')::uuid;
      if v_pe_id = any (v_keep) then
        continue;
      end if;
      -- 独自種目は担当トレーナーのものだけ使える
      if v_trainer_ex is not null and not exists (
        select 1 from trainer_exercises where id = v_trainer_ex and trainer_id = v_link.trainer_id
      ) then
        raise exception 'trainer exercise not found' using errcode = '42501';
      end if;
      v_idx := v_idx + 1;

      v_pe := null;
      if v_pe_id is not null then
        select * into v_pe from plan_exercises where id = v_pe_id and plan_day_id = v_day.id;
      end if;

      if v_pe.id is not null
         and v_pe.exercise_master_id is not distinct from v_master
         and v_pe.trainer_exercise_id is not distinct from v_trainer_ex
         and v_pe.cardio_master_id is not distinct from v_cardio then
        -- 同じ種目: ID を残して更新する
        v_ex := v_pe.id;
        update plan_exercises
        set sort_order = v_idx,
            note = nullif(btrim(r_ex->>'note'), ''),
            target_duration_seconds = nullif(r_ex->>'target_duration_seconds', '')::integer,
            target_distance_km = nullif(r_ex->>'target_distance_km', '')::numeric
        where id = v_ex;
        create temp table if not exists _client_plan_old_sets (set_number int, target_pct_1rm numeric, target_weight_kg numeric) on commit drop;
        delete from _client_plan_old_sets;
        insert into _client_plan_old_sets select set_number, target_pct_1rm, target_weight_kg from plan_sets where plan_exercise_id = v_ex;
        delete from plan_sets where plan_exercise_id = v_ex;
      else
        -- 種目を入れ替えた・新しく足した: 新しい行にする
        if v_pe.id is not null then
          delete from plan_exercises where id = v_pe.id;
        end if;
        insert into plan_exercises (plan_day_id, exercise_master_id, trainer_exercise_id, cardio_master_id, sort_order, note, target_duration_seconds, target_distance_km)
        values (
          v_day.id, v_master, v_trainer_ex, v_cardio, v_idx,
          nullif(btrim(r_ex->>'note'), ''),
          nullif(r_ex->>'target_duration_seconds', '')::integer,
          nullif(r_ex->>'target_distance_km', '')::numeric
        )
        returning id into v_ex;
        create temp table if not exists _client_plan_old_sets (set_number int, target_pct_1rm numeric, target_weight_kg numeric) on commit drop;
        delete from _client_plan_old_sets;
      end if;

      select one_rm into v_one_rm from _client_plan_one_rm
      where exercise_master_id is not distinct from v_master and trainer_exercise_id is not distinct from v_trainer_ex;

      v_set_no := 0;
      for r_set in select * from jsonb_array_elements(coalesce(r_ex->'sets', '[]'::jsonb)) loop
        v_set_no := v_set_no + 1;
        v_pct := nullif(r_set->>'target_pct_1rm', '')::numeric;
        v_kg := nullif(r_set->>'target_weight_kg', '')::numeric;
        if v_pct is not null and v_kg is null then
          select o.target_weight_kg into v_kg from _client_plan_old_sets o
          where o.set_number = v_set_no and o.target_pct_1rm = v_pct and o.target_weight_kg is not null;
          if v_kg is null and v_one_rm is not null then
            v_kg := public.round_to_plate(v_pct * v_one_rm);
          end if;
        end if;
        insert into plan_sets (plan_exercise_id, set_number, target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup, updated_by)
        values (
          v_ex, v_set_no, v_pct, v_kg,
          (r_set->>'target_reps')::smallint,
          nullif(r_set->>'target_rir', '')::smallint,
          coalesce((r_set->>'is_warmup')::boolean, false),
          v_uid
        );
      end loop;
    end loop;
  end loop;

  update coaching_plans set updated_at = now() where id = p_plan_id;
end;
$function$;

revoke execute on function public.replace_client_plan_days(uuid, jsonb) from public, anon;
grant execute on function public.replace_client_plan_days(uuid, jsonb) to authenticated;

commit;
