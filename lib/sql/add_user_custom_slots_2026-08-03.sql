-- ユーザーがコーチングタブから追加する種目スロット。24カテゴリのprogram_slotsとは別に、
-- 週次進行計算（アイソレーション方式）だけを適用する軽量なスロット。
create table if not exists user_custom_slots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  enrollment_id uuid references user_program_enrollments(id) on delete cascade not null,
  exercise_id uuid references user_exercises(id) on delete cascade not null,
  day_number smallint not null check (day_number between 1 and 4),
  muscle_group text not null,
  rep_range_min smallint not null default 10,
  rep_range_max smallint not null default 15,
  created_at timestamptz default now() not null
);

alter table user_custom_slots enable row level security;

create policy "users can manage own custom slots" on user_custom_slots
  for all using (auth.uid() = user_id);
