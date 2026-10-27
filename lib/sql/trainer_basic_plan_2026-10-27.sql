-- トレーナーの料金をオーナーの資料（Auxlog B2B 事業戦略・導入マニュアル）に合わせる（2026-10-27）
--   スターター ¥0（3名）/ ベーシック ¥2,980（10名、新設）/ プロ ¥6,800（30名、¥9,800 から値下げ）/ ビジネス ¥19,800（無制限）。すべて税込
-- DB はプランの値に 'basic' を足し、クライアントの上限を10名にする。金額は Stripe の価格（metadata.auxlog_plan = trainer_basic）で持つ

begin;

alter table public.trainer_profiles drop constraint trainer_profiles_plan_check;
alter table public.trainer_profiles add constraint trainer_profiles_plan_check check (plan = any (array['starter', 'basic', 'pro', 'business']));

CREATE OR REPLACE FUNCTION public.trainer_trainee_limit(p_trainer uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists (
      select 1 from organizations o join trainer_profiles op on op.user_id = o.owner_user_id and op.plan = 'business'
      where o.owner_user_id = p_trainer and not o.owner_is_trainer
    ) then 0
    else case public.trainer_effective_plan(p_trainer)
      when 'basic' then 10
      when 'pro' then 30
      when 'business' then 2147483647
      else 3
    end
  end;
$function$;

commit;
