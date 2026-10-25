-- トレーナーのプラン（2026-10-25 料金体系の決定）: スターター ¥0（クライアント3名）・プロ ¥9,800（30名）・ビジネス ¥19,800（無制限）。
-- 課金（Stripe）はまだ無いが、プランごとの上限と画面の「◯◯プランの残り」をここで持つ。課金を入れたら Webhook がこの列を書き換える。
-- trainer_profiles は authenticated に SELECT しか許していない（書き込みは DB 関数だけ）ので、トレーナーが自分でプランを変えることはできない。

begin;

alter table public.trainer_profiles
  add column if not exists plan text not null default 'starter' check (plan in ('starter', 'pro', 'business'));

-- クライアント（招待中・契約中・一時停止中、自分は除く）の上限。ビジネスは無制限
create or replace function public.trainer_trainee_limit(p_trainer uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce((select plan from trainer_profiles where user_id = p_trainer), 'starter')
    when 'pro' then 30
    when 'business' then 2147483647
    else 3
  end;
$$;

revoke execute on function public.trainer_trainee_limit(uuid) from public, anon, authenticated;

-- スクリーンショット用のデモのトレーナー（佐藤翔太、クライアント7名）はプロプラン
update public.trainer_profiles set plan = 'pro'
where user_id = (select id from auth.users where email = 'rubono935@nyasan.com');

commit;
