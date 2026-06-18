-- user_exercises に recent_session_ids カラムを追加
-- 各種目の直近セッション ID を最大3件保持し、ホームページの 100 セッション一括取得を廃止する

alter table user_exercises
  add column if not exists recent_session_ids uuid[] not null default '{}';

-- 一括更新用 RPC 関数（セッション保存時に呼び出す）
-- p_exercise_ids の各 user_exercise に p_session_id を prepend し、先頭3件だけ保持する
create or replace function update_recent_session_ids(
  p_exercise_ids uuid[],
  p_session_id   uuid
) returns void
language sql
security definer
as $$
  update user_exercises
  set recent_session_ids = (
    array_prepend(p_session_id, coalesce(recent_session_ids, '{}'))
  )[1:3]
  where id = any(p_exercise_ids);
$$;

-- バックフィル：既存ユーザーの直近3セッション ID を設定
with ranked as (
  select
    ts.exercise_id,
    s.id as session_id,
    row_number() over (
      partition by ts.exercise_id
      order by s.trained_at desc, s.id desc
    ) as rn
  from (
    select distinct exercise_id, session_id
    from training_sets
  ) ts
  join training_sessions s on s.id = ts.session_id
),
last3 as (
  select
    exercise_id,
    array_agg(session_id order by rn) as recent_ids
  from ranked
  where rn <= 3
  group by exercise_id
)
update user_exercises ue
set recent_session_ids = l3.recent_ids
from last3 l3
where ue.id = l3.exercise_id;
