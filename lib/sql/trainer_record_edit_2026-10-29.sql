-- トレーナーがクライアントの記録をその場で直す・代わりに入力する（2026-10-29）
--   オーナー決定: 代理入力も含める / 契約中のクライアントだけ（担当トレーナーとチームの管理者）/ 入力者を残して画面に出す
--   1. 記録に入力者を残す列（recorded_by_trainer_id: トレーナーが入力した、edited_by_trainer_id: トレーナーが直した）
--   2. 書き込みは下の RPC だけ（training_sessions・training_sets のポリシーは本人のまま）
--   3. 自己ベストの計算し直しを DB でする（トレーナーは exercise_bests に書けないため。lib/record/exercise_bests.ts と同じ計算）
--   4. プランの種目の準備（ensure_plan_user_exercise）と %1RM の重量の自動入力（fill_plan_weights）をトレーナーも使えるようにする

begin;

-- 1. 入力者。null = クライアント本人。既存の行は null のまま（本人の記録）
alter table public.training_sessions
  add column if not exists recorded_by_trainer_id uuid references auth.users(id) on delete set null,
  add column if not exists edited_by_trainer_id uuid references auth.users(id) on delete set null;

-- その日の記録を直せるか: 契約中（active）の担当トレーナーかチームの管理者で、契約の開始日以降の記録
create or replace function public.can_trainer_edit(p_trainee uuid, p_trained_on date)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from trainer_trainee_links l
    where (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.status = 'active'
      and l.started_at::date <= p_trained_on
  );
$function$;

-- プランの種目を記録できる人（クライアント本人か、契約中の担当トレーナー・チームの管理者）。クライアントの ID を返す
create or replace function public.assert_plan_exercise_recorder(p_plan_exercise_id uuid)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_trainee uuid;
begin
  select l.trainee_id into v_trainee
  from plan_exercises pe
  join plan_days d on d.id = pe.plan_day_id
  join coaching_plans p on p.id = d.plan_id
  join trainer_trainee_links l on l.id = p.link_id
  where pe.id = p_plan_exercise_id
    and l.status = 'active'
    and p.status in ('shared', 'active')
    and (l.trainee_id = v_uid or (l.trainer_id <> l.trainee_id and (l.trainer_id = v_uid or public.is_team_owner_of(l.trainer_id))));
  if v_uid is null or v_trainee is null then
    raise exception 'plan exercise not found' using errcode = '42501';
  end if;
  return v_trainee;
end;
$function$;

-- 3. 自己ベストを残っている記録から計算し直す（lib/record/exercise_bests.ts の computeExerciseBest と同じ:
--    最大重量とその重量での最大回数、1回の記録の総挙上量・総回数の最大。ウォームアップと有酸素は数えない）。中から呼ぶだけ
create or replace function public.recompute_exercise_bests_for(p_user uuid, p_exercise_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  with working as (
    select t.exercise_id, t.session_id, t.weight_kg::double precision as w, t.reps
    from training_sets t join training_sessions s on s.id = t.session_id
    where s.user_id = p_user and t.exercise_id = any(p_exercise_ids)
      and not t.is_warmup and t.duration_seconds is null
  ),
  top as (
    select distinct on (exercise_id) exercise_id, w, reps from working order by exercise_id, w desc, reps desc
  ),
  per_session as (
    select exercise_id, max(volume) as volume, max(total_reps) as total_reps
    from (select exercise_id, session_id, sum(w * reps) as volume, sum(reps)::int as total_reps from working group by 1, 2) x
    group by 1
  )
  insert into exercise_bests (user_id, exercise_id, best_weight_kg, best_reps, best_volume, best_total_reps, updated_at)
  select p_user, top.exercise_id, top.w, top.reps, ps.volume, ps.total_reps, now()
  from top join per_session ps using (exercise_id)
  on conflict (user_id, exercise_id) do update
  set best_weight_kg = excluded.best_weight_kg, best_reps = excluded.best_reps, best_volume = excluded.best_volume,
      best_total_reps = excluded.best_total_reps, updated_at = excluded.updated_at;

  delete from exercise_bests b
  where b.user_id = p_user and b.exercise_id = any(p_exercise_ids)
    and not exists (
      select 1 from training_sets t join training_sessions s on s.id = t.session_id
      where s.user_id = p_user and t.exercise_id = b.exercise_id and not t.is_warmup and t.duration_seconds is null
    );
end;
$function$;
revoke all on function public.recompute_exercise_bests_for(uuid, uuid[]) from public, anon, authenticated;

-- 4. プランの種目に対応するクライアントの種目（user_exercises）を用意する。本体を分け、クライアント本人の
--    ensure_plan_user_exercise とトレーナーの代理入力（trainer_save_client_session）の両方から使う。中身は 10/26 版と同じ
create or replace function public.ensure_plan_user_exercise_for(p_uid uuid, p_plan_exercise_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pe plan_exercises%rowtype;
  v_te trainer_exercises%rowtype;
  v_ue uuid;
  v_sort int;
begin
  -- 同じ人・同じ種目の同時実行を直列化する（記録を同時に保存すると種目が2行できうるため、M3）
  select * into v_pe from plan_exercises where id = p_plan_exercise_id;
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':' || coalesce(v_pe.exercise_master_id, v_pe.trainer_exercise_id, v_pe.cardio_master_id)::text, 0));
  select coalesce(max(sort_order), 0) + 1 into v_sort from user_exercises where user_id = p_uid;

  if v_pe.exercise_master_id is not null then
    select id into v_ue from user_exercises
    where user_id = p_uid and exercise_master_id = v_pe.exercise_master_id
    order by is_active desc, created_at
    limit 1;
    if v_ue is null then
      insert into user_exercises (user_id, exercise_master_id, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound)
      select p_uid, m.id, 3, 10, v_sort, true, coalesce(m.is_bodyweight, false), m.is_compound
      from exercise_master m where m.id = v_pe.exercise_master_id
      returning id into v_ue;
    end if;
  elsif v_pe.cardio_master_id is not null then
    -- 有酸素の一覧の種目（2026-10-26）。クライアントが自分で追加した時と同じ形（custom_name・custom_target_muscle = 'cardio'）
    select id into v_ue from user_exercises
    where user_id = p_uid and cardio_master_id = v_pe.cardio_master_id
    order by is_active desc, created_at
    limit 1;
    if v_ue is null then
      insert into user_exercises (user_id, cardio_master_id, custom_name, custom_target_muscle, default_sets, default_reps, sort_order, is_active)
      select p_uid, c.id, c.name, 'cardio', 1, 1, v_sort, true
      from cardio_master c where c.id = v_pe.cardio_master_id
      returning id into v_ue;
    end if;
  else
    select * into v_te from trainer_exercises where id = v_pe.trainer_exercise_id;
    select id into v_ue from user_exercises
    where user_id = p_uid and trainer_exercise_id = v_te.id;
    if v_ue is null then
      insert into user_exercises (user_id, custom_name, custom_target_muscle, default_sets, default_reps, sort_order, is_active, is_bodyweight, is_compound, trainer_exercise_id)
      values (p_uid, v_te.name, v_te.target_muscle, 3, 10, v_sort, true, v_te.is_bodyweight, v_te.is_compound, v_te.id)
      returning id into v_ue;
    end if;
  end if;

  update user_exercises set is_active = true where id = v_ue and not is_active;
  return v_ue;
end;
$function$;
revoke all on function public.ensure_plan_user_exercise_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.ensure_plan_user_exercise(p_plan_exercise_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return public.ensure_plan_user_exercise_for(public.assert_trainee_plan_exercise(p_plan_exercise_id), p_plan_exercise_id);
end;
$function$;

-- %1RM の重量の自動入力: トレーナーが代理入力した初回の記録からも入れる（本人確認を assert_plan_exercise_recorder に替えただけ）
create or replace function public.fill_plan_weights(p_plan_exercise_id uuid, p_one_rm_kg numeric)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.assert_plan_exercise_recorder(p_plan_exercise_id);
  v_pe plan_exercises%rowtype;
  v_plan uuid;
  v_count int;
begin
  if p_one_rm_kg is null or p_one_rm_kg <= 0 or p_one_rm_kg > 500 then
    raise exception 'one_rm out of range' using errcode = '22023';
  end if;
  -- 推定の元になる記録が、クライアントのこの種目の記録としてあること
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
$function$;

-- 2. 記録を保存する（無ければ作る＝代理入力、あればセットを置き換える＝修正）。p_session_id は画面で作った ID で、
--    同じ ID の保存は何回送っても同じ結果になる（自動保存の再送・元に戻すで消した記録を戻す時も同じ ID で作り直す）。
--    p_sets の各行: exercise_id（クライアントの種目）か plan_exercise_id（プランの種目。初めての種目はクライアントの
--    種目一覧に用意する）、set_number, weight_kg, reps, rir, is_warmup, duration_seconds, distance_km, calories_kcal。
--    範囲は表の制約、種目・プランの持ち主はトリガー（check_training_set_*）でも確かめる
create or replace function public.trainer_save_client_session(p_trainee uuid, p_session_id uuid, p_trained_at date, p_sets jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session training_sessions%rowtype;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_before uuid[];
  v_after uuid[];
  v_set jsonb;
  v_exercise uuid;
  v_plan_exercise uuid;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 or jsonb_array_length(p_sets) > 50 then
    raise exception 'sets required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('session:' || p_session_id::text, 0));

  select * into v_session from training_sessions where id = p_session_id;
  if found then
    if v_session.user_id <> p_trainee or not public.can_trainer_edit(p_trainee, v_session.trained_at) then
      raise exception 'session not editable' using errcode = '42501';
    end if;
    select coalesce(array_agg(distinct exercise_id), '{}') into v_before from training_sets where session_id = p_session_id;
    update training_sessions set edited_by_trainer_id = v_uid where id = p_session_id;
    delete from training_sets where session_id = p_session_id;
  else
    if p_trained_at is null or p_trained_at > v_today or not public.can_trainer_edit(p_trainee, p_trained_at) then
      raise exception 'session not editable' using errcode = '42501';
    end if;
    v_before := '{}';
    -- 体調はトレーナーの画面では聞かないので、記録画面の初期値（3）にする
    insert into training_sessions (id, user_id, trained_at, fatigue_level, recorded_by_trainer_id)
    values (p_session_id, p_trainee, p_trained_at, 3, v_uid);
  end if;

  for v_set in select * from jsonb_array_elements(p_sets) loop
    v_plan_exercise := nullif(v_set->>'plan_exercise_id', '')::uuid;
    v_exercise := nullif(v_set->>'exercise_id', '')::uuid;
    if v_exercise is null then
      if v_plan_exercise is null or public.assert_plan_exercise_recorder(v_plan_exercise) <> p_trainee then
        raise exception 'exercise required' using errcode = '22023';
      end if;
      v_exercise := public.ensure_plan_user_exercise_for(p_trainee, v_plan_exercise);
    elsif v_plan_exercise is not null and not exists (
      select 1 from plan_exercises pe
      join plan_days d on d.id = pe.plan_day_id
      join coaching_plans p on p.id = d.plan_id
      join trainer_trainee_links l on l.id = p.link_id
      where pe.id = v_plan_exercise and l.trainee_id = p_trainee and l.status = 'active' and p.status in ('shared', 'active')
    ) then
      -- 終わったプランの種目の記録を直す時は、紐付けはトリガーで拒否されるので外して記録だけ残す（クライアントの修正と同じ）
      v_plan_exercise := null;
    end if;
    insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, plan_exercise_id, duration_seconds, distance_km, calories_kcal)
    values (
      p_session_id, v_exercise, (v_set->>'set_number')::int, (v_set->>'weight_kg')::numeric, (v_set->>'reps')::int,
      coalesce((v_set->>'rir')::boolean, false), coalesce((v_set->>'is_warmup')::boolean, false), v_plan_exercise,
      (v_set->>'duration_seconds')::int, (v_set->>'distance_km')::numeric, (v_set->>'calories_kcal')::int
    );
  end loop;

  select coalesce(array_agg(distinct exercise_id), '{}') into v_after from training_sets where session_id = p_session_id;
  perform public.recompute_exercise_bests_for(p_trainee, v_before || v_after);

  -- 新しい記録は「前回の記録」の参照（recent_session_ids）にも入れる（クライアントの保存と同じ。直した記録は順番を変えない）
  if v_session.id is null then
    update user_exercises
    set recent_session_ids = (array_prepend(p_session_id, coalesce(recent_session_ids, '{}')))[1:3]
    where id = any(v_after) and user_id = p_trainee;
  end if;
end;
$function$;

-- 記録を消す（トレーナーの画面で記録のセットをすべて外した時・ゴミ箱）。自己ベストを計算し直す
create or replace function public.trainer_delete_client_session(p_session_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session training_sessions%rowtype;
  v_exercises uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('session:' || p_session_id::text, 0));
  select * into v_session from training_sessions where id = p_session_id;
  -- もう無い（二重送信）なら何もしない
  if not found then
    return;
  end if;
  if not public.can_trainer_edit(v_session.user_id, v_session.trained_at) then
    raise exception 'session not editable' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct exercise_id), '{}') into v_exercises from training_sets where session_id = p_session_id;
  delete from training_sessions where id = p_session_id;
  perform public.recompute_exercise_bests_for(v_session.user_id, v_exercises);
end;
$function$;

revoke all on function public.trainer_save_client_session(uuid, uuid, date, jsonb) from public, anon;
revoke all on function public.trainer_delete_client_session(uuid) from public, anon;
grant execute on function public.trainer_save_client_session(uuid, uuid, date, jsonb) to authenticated;
grant execute on function public.trainer_delete_client_session(uuid) to authenticated;

commit;
