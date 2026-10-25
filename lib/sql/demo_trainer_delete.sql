-- スクリーンショット用のデモデータ（トレーナー 佐藤翔太 rubono935@nyasan.com、2026-10-25 作成）を消す。
-- 架空のクライアント（@demo.auxlog.invalid）のアカウントと記録、デモのトレーナーのテンプレート・契約を削除する。
-- トレーナーのアカウント（rubono935@nyasan.com）自体は残す（消す時は最後の2行のコメントを外す）。
begin;
-- 架空のクライアントの記録（記録 → 種目の順に消す。種目は記録から参照されているため先に記録を消す）
delete from public.training_sessions where user_id in (select id from auth.users where email like '%@demo.auxlog.invalid');
delete from public.plan_exercise_skips where trainee_id in (select id from auth.users where email like '%@demo.auxlog.invalid');
-- アカウント（種目・自己ベストなどは連鎖で消える）
delete from auth.users where email like '%@demo.auxlog.invalid';
delete from public.users where email like '%@demo.auxlog.invalid';
-- デモのトレーナーの契約・プラン・テンプレート
delete from public.coaching_plans where trainer_id = (select id from auth.users where email = 'rubono935@nyasan.com');
delete from public.trainer_trainee_links where trainer_id = (select id from auth.users where email = 'rubono935@nyasan.com') and trainee_id is distinct from trainer_id;
-- delete from public.trainer_profiles where user_id = (select id from auth.users where email = 'rubono935@nyasan.com');
-- delete from auth.users where email = 'rubono935@nyasan.com';
commit;
