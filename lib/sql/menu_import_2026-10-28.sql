-- メニューのインポート（2026-10-28）
--   1. 読み取り（Gemini）の回数の記録と、1日の上限（トレーナーごとに日本時間で1日20回）
--   2. 取り込んだメニューからテンプレートを1回で作る RPC（下書きの編集画面で「保存」を押した時だけ呼ぶ）
-- 取り込みで作ったテンプレートは generation_inputs = {"method": "import"}（source は 'blank' のまま。複製しても印が残る）

begin;

create table if not exists public.menu_import_runs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  input_chars integer not null,
  created_at timestamptz not null default now()
);
create index if not exists menu_import_runs_trainer_created on public.menu_import_runs (trainer_id, created_at);
-- 読み書きは下の RPC だけ（ポリシーを作らないので、画面から直接は読めない）
alter table public.menu_import_runs enable row level security;

-- 読み取りを1回始める。今日（日本時間）の回数が上限なら止め、そうでなければ記録して残りの回数を返す
create or replace function public.start_menu_import(p_input_chars integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.assert_trainer();
  v_limit constant integer := 20;
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  v_used integer;
begin
  -- 同じトレーナーが同時に押しても上限を超えないよう、トレーナーごとに順番にする
  perform pg_advisory_xact_lock(hashtext('menu_import:' || v_uid::text));
  select count(*) into v_used from menu_import_runs where trainer_id = v_uid and created_at >= v_today;
  if v_used >= v_limit then
    raise exception 'menu import limit' using errcode = 'P0001', hint = 'import_limit';
  end if;
  insert into menu_import_runs (trainer_id, input_chars) values (v_uid, coalesce(p_input_chars, 0));
  return v_limit - v_used - 1;
end;
$function$;

-- 取り込んだメニューからテンプレートを作る。p_days は [{week, day, label, exercises}]（exercises は replace_template_day と同じ形）
create or replace function public.create_imported_template(p_name text, p_total_weeks integer, p_days_per_week integer, p_days jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_plan uuid;
  v_day uuid;
  r_day jsonb;
begin
  v_plan := public.create_plan_template(p_name, p_total_weeks, p_days_per_week);
  update coaching_plans set generation_inputs = jsonb_build_object('method', 'import') where id = v_plan;

  for r_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    select id into v_day from plan_days
    where plan_id = v_plan and week_number = (r_day->>'week')::int and day_number = (r_day->>'day')::int;
    if v_day is null then
      raise exception 'day out of range' using errcode = '22023';
    end if;
    update plan_days set label = nullif(left(btrim(coalesce(r_day->>'label', '')), 30), '') where id = v_day;
    perform public.replace_template_day(v_day, coalesce(r_day->'exercises', '[]'::jsonb));
  end loop;

  return v_plan;
end;
$function$;

revoke execute on function public.start_menu_import(integer) from public, anon;
grant execute on function public.start_menu_import(integer) to authenticated;
revoke execute on function public.create_imported_template(text, integer, integer, jsonb) from public, anon;
grant execute on function public.create_imported_template(text, integer, integer, jsonb) to authenticated;

commit;
