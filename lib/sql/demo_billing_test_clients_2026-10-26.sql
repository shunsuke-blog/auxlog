-- 本番の課金の確認用（2026-10-26）。支払い確認用トレーナー（memu47@quicksend.ch）にテスト用のクライアントを3人つける。
-- メールは届かない example.com のアドレス（クライアントとしてログインはしない）。スタータープランの上限（3人）ちょうど。
begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('5e5e0002-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'auxlog-billing-client' || n || '@example.com', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 3) n;

insert into public.trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
select 'f45db398-b7b0-4cb2-ac45-fcf4374b5378', ('5e5e0002-0000-4000-8000-00000000000' || n)::uuid, 'テスト 課金' || n, 'active', now()
from generate_series(1, 3) n;

select trainee_display_name, status from public.trainer_trainee_links
where trainer_id = 'f45db398-b7b0-4cb2-ac45-fcf4374b5378' and trainee_id is distinct from trainer_id order by trainee_display_name;
commit;
