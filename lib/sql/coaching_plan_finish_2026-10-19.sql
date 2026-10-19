-- コーチングプランの完了と、契約終了後のセルフモード自動作成の下準備（2026-10-19）
--
-- 決定事項:
--   - 契約中はプランが終わってもセルフモードを作らない。成長レポートを見せてプランを完了し、
--     ホームでトレーナーの次のプランを待つ
--   - セルフモードは契約が終わった時だけ、記録から1RMを推定して自動で作る

begin;

-- 同時に進められるセルフモードのプログラムは1人1つ（自動作成が同時に走っても2つ作らない）。
-- 適用前に重複が無いことを確認済み（2026-10-19、0件）。
create unique index user_program_enrollments_one_active_per_user
  on public.user_program_enrollments (user_id) where is_active;

-- プランを完了する（トレーニーが最終週の後に成長レポートを見て押す）
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
  where l.trainee_id = v_uid and l.trainer_id <> v_uid and l.status = 'active'
    and p.status in ('shared', 'active')
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

-- 契約が終わった最後のプランの1週目の日数（セルフモードの自動作成で週の日数に使う）。
-- 終了後のプランはトレーニーからRLSで読めないため、日数だけを返す。
create or replace function public.ended_plan_days_per_week(p_link_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from plan_days d
  where d.week_number = 1
    and d.plan_id = (
      select p.id from coaching_plans p
      join trainer_trainee_links l on l.id = p.link_id
      where l.id = p_link_id and l.trainee_id = auth.uid() and l.status = 'ended'
      order by p.created_at desc
      limit 1
    );
$$;

revoke execute on function public.finish_coaching_plan() from public, anon;
revoke execute on function public.ended_plan_days_per_week(uuid) from public, anon;
grant execute on function public.finish_coaching_plan() to authenticated;
grant execute on function public.ended_plan_days_per_week(uuid) to authenticated;

commit;
