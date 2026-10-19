-- コーチングプランのテンプレート編集（ロードマップ⑤の前段、2026-10-19）
--
-- 決定: テンプレートの重量は「1RM の何%」で持つ（既存エンジンの program_weekly_params と同じく小数、
-- 0.75 = 75%）。トレーニー追加時に入力した1RMから、そのトレーニー用のプランに kg を入れる（⑤）。
-- アイソレーション種目は重量を空欄（target_weight_kg も target_pct_1rm も null）にして前回記録から自動提案。
--
-- 書き込みはすべて SECURITY DEFINER の RPC に集約し、作成したトレーナー本人だけが変更できることを
-- 関数内で確認する（新規テーブルはクライアントの書き込み権限なし、要件定義「権限チェックの方式」）。
-- 今回の RPC はテンプレート（link_id is null）だけを対象にする。トレーニーのプランの編集（記録済みの
-- 種目のロックを含む）は⑤で別途作る。

begin;

alter table public.plan_sets
  add column target_pct_1rm numeric(4, 3)
  check (target_pct_1rm is null or (target_pct_1rm > 0 and target_pct_1rm <= 1.2));

-- ---------------------------------------------------------------------------
-- 共通: ログイン中のユーザーがトレーナーであること・テンプレートの持ち主であること
-- ---------------------------------------------------------------------------

create or replace function public.assert_trainer()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from trainer_profiles where user_id = v_uid) then
    raise exception 'trainer only' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.assert_own_template(p_plan_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
begin
  if not exists (
    select 1 from coaching_plans where id = p_plan_id and trainer_id = v_uid and link_id is null
  ) then
    raise exception 'template not found' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- テンプレートの作成・複製・名前変更・削除
-- ---------------------------------------------------------------------------

-- 白紙から作成。週数×週の日数ぶんの plan_days を空で作る。
create or replace function public.create_plan_template(p_name text, p_total_weeks int, p_days_per_week int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_name text := btrim(p_name);
  v_plan uuid;
begin
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
$$;

-- 既存テンプレートの複製（日・種目・セットまで丸ごとコピー）。
create or replace function public.duplicate_plan_template(p_plan_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_own_template(p_plan_id);
  v_name text := btrim(p_name);
  v_plan uuid;
  r_day record;
  r_ex record;
  v_day uuid;
  v_ex uuid;
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;

  insert into coaching_plans (trainer_id, link_id, name, total_weeks, status, source, based_on_plan_id)
  select v_uid, null, v_name, total_weeks, 'draft', 'template', id
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
$$;

create or replace function public.rename_plan_template(p_plan_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
begin
  perform public.assert_own_template(p_plan_id);
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;
  update coaching_plans set name = v_name, updated_at = now() where id = p_plan_id;
end;
$$;

-- テンプレートを消しても、共有時に複製したトレーニーのプランは残る（based_on_plan_id は SET NULL）。
create or replace function public.delete_plan_template(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_own_template(p_plan_id);
  delete from coaching_plans where id = p_plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day の中身を丸ごと保存する（種目・セットを入れ替え）
-- ---------------------------------------------------------------------------
-- p_exercises: [{ exercise_master_id | trainer_exercise_id, note,
--                 sets: [{ target_pct_1rm, target_weight_kg, target_reps, target_rir, is_warmup }] }]
-- 並び順・セット番号は配列の順。
create or replace function public.replace_template_day(p_plan_day_id uuid, p_exercises jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- トレーナー独自の種目
-- ---------------------------------------------------------------------------

create or replace function public.create_trainer_exercise(
  p_name text, p_target_muscle text, p_is_compound boolean, p_is_bodyweight boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception 'name must be 1-60 characters' using errcode = '22023';
  end if;
  insert into trainer_exercises (trainer_id, name, target_muscle, is_compound, is_bodyweight)
  values (v_uid, v_name, p_target_muscle, coalesce(p_is_compound, false), coalesce(p_is_bodyweight, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- 実行権限: ログインユーザーだけ（関数内でトレーナー本人かを確認する）
revoke execute on function public.assert_trainer() from public, anon;
revoke execute on function public.assert_own_template(uuid) from public, anon;
revoke execute on function public.create_plan_template(text, int, int) from public, anon;
revoke execute on function public.duplicate_plan_template(uuid, text) from public, anon;
revoke execute on function public.rename_plan_template(uuid, text) from public, anon;
revoke execute on function public.delete_plan_template(uuid) from public, anon;
revoke execute on function public.replace_template_day(uuid, jsonb) from public, anon;
revoke execute on function public.create_trainer_exercise(text, text, boolean, boolean) from public, anon;
grant execute on function public.create_plan_template(text, int, int) to authenticated;
grant execute on function public.duplicate_plan_template(uuid, text) to authenticated;
grant execute on function public.rename_plan_template(uuid, text) to authenticated;
grant execute on function public.delete_plan_template(uuid) to authenticated;
grant execute on function public.replace_template_day(uuid, jsonb) to authenticated;
grant execute on function public.create_trainer_exercise(text, text, boolean, boolean) to authenticated;

commit;
