-- user_slot_assignments に is_hidden カラムを追加
alter table user_slot_assignments add column if not exists is_hidden boolean not null default false;

-- 追加種目テーブル
create table if not exists user_program_day_extras (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  enrollment_id uuid references user_program_enrollments(id) on delete cascade not null,
  exercise_id uuid references user_exercises(id) on delete cascade not null,
  day_number smallint not null check (day_number between 1 and 4),
  created_at timestamptz default now() not null,
  unique (enrollment_id, exercise_id, day_number)
);

alter table user_program_day_extras enable row level security;

create policy "users can manage own day extras" on user_program_day_extras
  for all using (auth.uid() = user_id);
