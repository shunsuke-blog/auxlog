-- ブラウザで始めたクライアントがアプリに移るための使い捨てリンク（2026-11-07、ログイン用リンクの第2段階）
--   リンクで作ったアカウントは Apple・Google・メールが無いので、アプリには同じログイン用リンクでしか入れない。
--   ブラウザの画面の「アプリで開く」で、ログイン中の本人がその場で自分用のリンクを作り、アプリ（auxlogmobile://join/<token>）で使う。
--   - 10分だけ・1回だけ。トレーナーが作ったリンクは使えなくしない（トレーナーの画面にも出さない: self_issued）
--   - 作れるのは契約中・一時停止のクライアント本人だけ（使う時の確かめは use_trainee_login_link のまま）

begin;

alter table public.trainee_login_links add column if not exists self_issued boolean not null default false;

create or replace function public.issue_own_app_login_link()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_link_id uuid;
  v_token text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select id into v_link_id from trainer_trainee_links
  where trainee_id = v_uid and trainer_id <> v_uid and status in ('active', 'paused')
  order by created_at desc limit 1;
  if v_link_id is null then
    raise exception 'no trainer link' using errcode = 'P0001', hint = 'login_link_invalid';
  end if;
  v_token := public.new_login_link_token();
  insert into trainee_login_links (link_id, token, expires_at, self_issued) values (v_link_id, v_token, now() + interval '10 minutes', true);
  return v_token;
end;
$function$;

revoke execute on function public.issue_own_app_login_link() from public, anon;
grant execute on function public.issue_own_app_login_link() to authenticated;

commit;
