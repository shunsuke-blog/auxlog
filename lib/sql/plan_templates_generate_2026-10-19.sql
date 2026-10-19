-- 「Auxlog で作成」で生成したテンプレートを1トランザクションで保存する（2026-10-19）
--
-- 生成ロジックは lib/coaching/generate_template.ts（既存エンジンの週次パラメータを N週・週2〜7日に
-- 割り当てる）。ここでは、その結果（週×Dayごとの種目・セット）を create_plan_template と
-- replace_template_day を使って保存するだけ。権限チェックはそれぞれの関数の中で行われる。

create or replace function public.create_generated_template(
  p_name text,
  p_total_weeks int,
  p_days_per_week int,
  p_generation_inputs jsonb,
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan uuid;
  v_day uuid;
  r_day jsonb;
begin
  v_plan := public.create_plan_template(p_name, p_total_weeks, p_days_per_week);
  update coaching_plans set source = 'engine', generation_inputs = p_generation_inputs where id = v_plan;

  for r_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    select id into v_day from plan_days
    where plan_id = v_plan and week_number = (r_day->>'week')::int and day_number = (r_day->>'day')::int;
    if v_day is null then
      raise exception 'day out of range' using errcode = '22023';
    end if;
    perform public.replace_template_day(v_day, coalesce(r_day->'exercises', '[]'::jsonb));
  end loop;

  return v_plan;
end;
$$;

revoke execute on function public.create_generated_template(text, int, int, jsonb, jsonb) from public, anon;
grant execute on function public.create_generated_template(text, int, int, jsonb, jsonb) to authenticated;
