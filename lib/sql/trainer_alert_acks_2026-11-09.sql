-- ダッシュボードの「対応すること」のアラートを、トレーナーが「確認した」で消す（2026-11-09 オーナー決定: トレーナーごと）。
--   トレーナーができることは LINE などでの連絡だけなので、連絡した後もずっと残らないようにする。
--   alert_key はアラートの種類と「その状態」を表す（lib/trainer/dashboard.ts の alertKey）。状態が変われば別の鍵になり、また出る
--   （例: 記録なしは最後の記録日、目標未達はその記録の種目）。押したトレーナーの画面からだけ消える（チームの管理者には残る）

begin;

create table if not exists public.trainer_alert_acks (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  link_id uuid not null references public.trainer_trainee_links(id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 200),
  acked_at timestamptz not null default now(),
  primary key (trainer_id, link_id, alert_key)
);

alter table public.trainer_alert_acks enable row level security;

drop policy if exists "trainer_alert_acks: own" on public.trainer_alert_acks;
create policy "trainer_alert_acks: own" on public.trainer_alert_acks
  for all
  using (trainer_id = auth.uid())
  with check (
    trainer_id = auth.uid()
    and exists (
      select 1 from trainer_trainee_links l
      where l.id = trainer_alert_acks.link_id and (l.trainer_id = auth.uid() or public.is_team_owner_of(l.trainer_id))
    )
  );

revoke all on public.trainer_alert_acks from anon;
grant select, insert, delete on public.trainer_alert_acks to authenticated;

commit;
