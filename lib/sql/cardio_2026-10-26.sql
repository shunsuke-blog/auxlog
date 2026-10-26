-- 有酸素運動の種目（2026-10-26）
--
-- 種目は exercise_master ではなく別の表（cardio_master）に置く。公開中のアプリ（1.2.0 以前）は exercise_master を
-- 直接読んで「種目を追加」に並べるため、そこに入れると古いアプリでも有酸素が選べてしまい、重量・回数で記録されるため。
--
-- 利用者の種目（user_exercises）では、有酸素は custom_name に種目名・custom_target_muscle = 'cardio' で持つ
-- （種目名の表示は今までどおり custom_name で出る）。一覧の種目から追加した時は cardio_master_id も入れる。
--
-- 記録は training_sets の1行で、時間（必須）・距離・消費カロリー（任意）を持つ。重量・回数は 0 で保存する
-- （重量・回数の NOT NULL と今の集計をそのまま使うため）。自己ベスト・提案の計算からはアプリ側で外す。

begin;

create table public.cardio_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  sort_order integer not null,
  -- 距離を入れる欄を出すか（縄跳び・ステアクライマーは出さない）
  tracks_distance boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cardio_master enable row level security;
create policy "cardio_master is readable by signed-in users" on public.cardio_master for select to authenticated using (true);
revoke all on public.cardio_master from anon;
revoke insert, update, delete, truncate on public.cardio_master from authenticated;

insert into public.cardio_master (code, name, sort_order, tracks_distance) values
  ('running',       'ランニング',       10, true),
  ('treadmill',     'トレッドミル',     20, true),
  ('walking',       'ウォーキング',     30, true),
  ('exercise_bike', 'エアロバイク',     40, true),
  ('elliptical',    'クロストレーナー', 50, true),
  ('rowing',        'ローイングマシン', 60, true),
  ('stair_climber', 'ステアクライマー', 70, false),
  ('jump_rope',     '縄跳び',           80, false);

alter table public.user_exercises
  add column cardio_master_id uuid references public.cardio_master(id),
  add constraint user_exercises_cardio_muscle check (cardio_master_id is null or custom_target_muscle = 'cardio');

alter table public.training_sets
  add column duration_seconds integer,
  add column distance_km numeric(6, 2),
  add column calories_kcal integer,
  add constraint training_sets_duration_range check (duration_seconds is null or duration_seconds between 1 and 86400),
  add constraint training_sets_distance_range check (distance_km is null or (distance_km > 0 and distance_km <= 1000)),
  add constraint training_sets_calories_range check (calories_kcal is null or calories_kcal between 1 and 20000),
  -- 距離・カロリーは有酸素の記録（時間あり）だけ。有酸素の記録は重量・回数を 0 にする
  add constraint training_sets_cardio_shape check (
    (duration_seconds is null and distance_km is null and calories_kcal is null)
    or (duration_seconds is not null and weight_kg = 0 and reps = 0)
  );

commit;
