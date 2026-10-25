-- 自己ベスト（exercise_bests）を、残っている記録から計算し直す（2026-10-25、オーナー承認済み）。
-- 記録の削除・編集で下がらなかった値（消した記録の値）が残っていたため。以後は API が削除・編集の後に計算し直す
-- （lib/record/exercise_bests.ts）。計算は保存時と同じ: ワーキングセットの最大重量とその重量での最大回数、
-- 1回の記録の総挙上量・総回数の最大。適用前の確認: 88件中10件（3人）がずれていた（記録が残っていない9件・値の違い1件）。

begin;

create temp table _calc on commit drop as
with w as (
  select s.user_id, t.exercise_id, t.session_id, t.weight_kg, t.reps
  from public.training_sets t join public.training_sessions s on s.id = t.session_id
  where not t.is_warmup
), top as (
  select distinct on (user_id, exercise_id) user_id, exercise_id, weight_kg, reps
  from w order by user_id, exercise_id, weight_kg desc, reps desc
), sess as (
  select user_id, exercise_id, max(vol) as vol, max(tr) as tr
  from (select user_id, exercise_id, session_id, sum(weight_kg * reps) as vol, sum(reps) as tr from w group by 1, 2, 3) x
  group by 1, 2
)
select t.user_id, t.exercise_id, t.weight_kg, t.reps, s.vol, s.tr from top t join sess s using (user_id, exercise_id);

-- 記録が残っていない種目の自己ベストを消す
delete from public.exercise_bests b
where not exists (select 1 from _calc c where c.user_id = b.user_id and c.exercise_id = b.exercise_id);

-- 値がずれているものを記録から計算した値に直す
update public.exercise_bests b
set best_weight_kg = c.weight_kg, best_reps = c.reps, best_volume = c.vol, best_total_reps = c.tr, updated_at = now()
from _calc c
where c.user_id = b.user_id and c.exercise_id = b.exercise_id
  and (b.best_weight_kg <> c.weight_kg or b.best_reps <> c.reps or round(b.best_volume::numeric, 2) <> round(c.vol::numeric, 2) or b.best_total_reps <> c.tr);

commit;
