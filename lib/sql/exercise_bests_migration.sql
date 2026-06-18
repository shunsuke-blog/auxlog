-- exercise_bests テーブル作成
-- 種目ごとの自己最高記録を保持し、保存時の比較コストを O(1) にする

create table if not exists exercise_bests (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  exercise_id     uuid        not null,
  best_weight_kg  float       not null default 0,
  best_reps       int         not null default 0,
  best_volume     float       not null default 0,
  best_total_reps int         not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table exercise_bests enable row level security;

create policy "exercise_bests: own rows only"
  on exercise_bests for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 既存ユーザーのバックフィル
with session_stats as (
  select
    s.user_id,
    ts.exercise_id,
    s.id as session_id,
    max(ts.weight_kg)           as max_weight,
    sum(ts.weight_kg * ts.reps) as volume,
    sum(ts.reps)                as total_reps
  from training_sessions s
  join training_sets ts on ts.session_id = s.id and ts.is_warmup = false
  group by s.user_id, ts.exercise_id, s.id
),
global_max_weight as (
  select user_id, exercise_id, max(max_weight) as best_weight_kg
  from session_stats
  group by user_id, exercise_id
),
best_reps_at_max_weight as (
  select ss.user_id, ss.exercise_id, max(ts.reps) as best_reps
  from session_stats ss
  join global_max_weight gmw
    on gmw.user_id = ss.user_id and gmw.exercise_id = ss.exercise_id
  join training_sessions s on s.id = ss.session_id
  join training_sets ts
    on ts.session_id = s.id
    and ts.exercise_id = ss.exercise_id
    and ts.weight_kg = gmw.best_weight_kg
    and ts.is_warmup = false
  group by ss.user_id, ss.exercise_id
),
best_session_stats as (
  select user_id, exercise_id,
    max(volume)     as best_volume,
    max(total_reps) as best_total_reps
  from session_stats
  group by user_id, exercise_id
)
insert into exercise_bests
  (user_id, exercise_id, best_weight_kg, best_reps, best_volume, best_total_reps)
select
  gmw.user_id,
  gmw.exercise_id,
  gmw.best_weight_kg,
  coalesce(br.best_reps, 0),
  coalesce(bss.best_volume, 0),
  coalesce(bss.best_total_reps, 0)
from global_max_weight gmw
left join best_reps_at_max_weight br
  on br.user_id = gmw.user_id and br.exercise_id = gmw.exercise_id
left join best_session_stats bss
  on bss.user_id = gmw.user_id and bss.exercise_id = gmw.exercise_id
on conflict (user_id, exercise_id) do nothing;
