-- 調査用（読み取り専用、更新なし）。
-- 「トライセプスプレスダウンの重量が引き継がれない」問題の原因切り分け。
-- exercise_master / user_exercises に同名の重複行があり、7/3にログした種目IDと
-- 現在スロットに割り当てられている種目IDが食い違っている可能性を確認する。

-- Step 1: exercise_master に「トライセプスプレスダウン」という名前の行が複数無いか確認
select id, name, target_muscle, movement_pattern, tier, sort_order, requires_one_rm
from exercise_master
where name = 'トライセプスプレスダウン';

-- Step 2: このユーザーの user_exercises で、上記 exercise_master_id に紐づく行を確認
-- （メールアドレスから自動でuser_idを引く。オーナー本人のアカウントのメールに変更可）
select ue.id as user_exercise_id, ue.exercise_master_id, ue.is_active, ue.sort_order, em.name
from user_exercises ue
join exercise_master em on em.id = ue.exercise_master_id
where ue.user_id = (select id from auth.users where email = 'mdrgkb4869smrgkk@icloud.com')
  and em.name = 'トライセプスプレスダウン';

-- Step 3: 現在アクティブなプログラムで、「トライセプスプレスダウン」が割り当てられている
-- スロット（どのslot_idかは事前に断定せず、名前一致で確認する）
select usa.slot_id, usa.exercise_id, ue.exercise_master_id, em.name
from user_slot_assignments usa
join user_program_enrollments upe on upe.id = usa.enrollment_id
join user_exercises ue on ue.id = usa.exercise_id
join exercise_master em on em.id = ue.exercise_master_id
where upe.user_id = (select id from auth.users where email = 'mdrgkb4869smrgkk@icloud.com')
  and upe.is_active = true
  and em.name = 'トライセプスプレスダウン';

-- Step 4: 2026-07-03 に記録されたセットが、どの exercise_id に紐づいているか確認
select ts.exercise_id, ts.weight_kg, ts.reps, ts.is_warmup, tsess.trained_at
from training_sets ts
join training_sessions tsess on tsess.id = ts.session_id
where tsess.user_id = (select id from auth.users where email = 'mdrgkb4869smrgkk@icloud.com')
  and tsess.trained_at::date = '2026-07-03';
