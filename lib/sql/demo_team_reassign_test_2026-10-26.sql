-- 担当替えの確認用（2026-10-26）。管理者 beho80（SUNNY SIDE GYM、管理だけ）のチームに、
-- テスト用のトレーナー「テスト 鈴木」と、そのクライアント「テスト 担当替え」を作る。
-- メールは届かない example.com のアドレス（ログインには使わない。管理者の画面で確認する用）。
begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('5e5e0001-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auxlog-test-trainer@example.com', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('5e5e0001-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auxlog-test-client@example.com', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- トレーナー登録は本人として register_as_trainer を呼ぶ（自分自身との契約も作られる）
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"5e5e0001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.register_as_trainer('テスト 鈴木');
reset role;

insert into public.organization_memberships (organization_id, trainer_id, status, approved_at)
values ('a65e9708-4d66-4edc-a175-2fef91ce31a4', '5e5e0001-0000-4000-8000-000000000001', 'approved', now());

insert into public.trainer_trainee_links (trainer_id, trainee_id, trainee_display_name, status, started_at)
values ('5e5e0001-0000-4000-8000-000000000001', '5e5e0001-0000-4000-8000-000000000002', 'テスト 担当替え', 'active', now());

select tp.display_name, m.status,
  (select count(*) from public.trainer_trainee_links l where l.trainer_id = tp.user_id and l.trainee_id <> tp.user_id) clients
from public.trainer_profiles tp join public.organization_memberships m on m.trainer_id = tp.user_id
where tp.user_id = '5e5e0001-0000-4000-8000-000000000001';
commit;
