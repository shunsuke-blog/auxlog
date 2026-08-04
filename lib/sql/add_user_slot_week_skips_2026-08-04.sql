-- ホーム画面のスワイプ削除を「その週だけスキップ」にするための週次スキップ記録。
-- user_slot_assignments.is_hidden（プログラム期間中ずっと非表示）とは別に、
-- 週番号を持たせて特定の週だけ提案から除外する。slot_idは24カテゴリのidまたは
-- user_custom_slots.idのどちらも入りうるためtext（FK制約なし、既存のslot_id運用と同じ）。
create table if not exists user_slot_week_skips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  enrollment_id uuid references user_program_enrollments(id) on delete cascade not null,
  slot_id text not null,
  week_number smallint not null,
  created_at timestamptz default now() not null,
  unique (enrollment_id, slot_id, week_number)
);

alter table user_slot_week_skips enable row level security;

create policy "users can manage own slot week skips" on user_slot_week_skips
  for all using (auth.uid() = user_id);
