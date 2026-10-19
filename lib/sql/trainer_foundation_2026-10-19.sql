-- トレーナー機能のDB基盤（ロードマップ①、2026-10-19）
--
-- 要件定義: https://claude.ai/code/artifact/41095ec7-5fe4-4995-a8dd-5954b5878988
--   「新規テーブル定義」「既存テーブルの変更」「権限・ロックルール」「権限チェックの方式（決定）」
--
-- 方針:
--   - 読み取りはRLS、トレーナー関連の書き込みはAPI（サービスロール）。新規テーブルは
--     クライアントにSELECTしか許可しない（INSERT/UPDATE/DELETE権限を剥奪し、RLSもSELECTのみ）。
--   - トレーナーの閲覧判定は SECURITY DEFINER 関数に集約し、RLSとAPI（RPC）の両方から使う。
--   - 既存テーブルの「本人ならALL」ポリシーには触れず、トレーナー用のSELECTポリシーを追加するだけ
--     （PERMISSIVEポリシーはORで評価されるため、本人のアクセスは何も変わらない）。
--   - トレーナーがアカウント削除してもトレーニーの記録は消さない（training_sets.plan_exercise_id は SET NULL）。
--
-- 全体を1トランザクションで適用する。確認は verify_trainer_rls_2026-10-19.sql。

begin;

-- ---------------------------------------------------------------------------
-- 既存テーブルの変更
-- ---------------------------------------------------------------------------

-- アカウント種別。ジム経営者はトレーナー・トレーニーと完全に別のアカウント。
-- users はクライアントからの書き込み権限を剥奪済み（2026-10-19）なので、変更はAPIからのみ。
alter table public.users
  add column account_type text not null default 'member'
  check (account_type in ('member', 'gym_owner'));

-- ---------------------------------------------------------------------------
-- 組織・トレーナー・課金
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid default gen_random_uuid() primary key,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now() not null
);
create index organizations_owner_idx on public.organizations (owner_user_id);

-- トレーナー向け招待コード。複数トレーナーで使い回し可（QRはこのcodeを表示するだけ）。
create table public.organization_invites (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null
);

-- トレーナーの組織所属。参加には経営者の承認が必要。トレーナーは最大1組織。
create table public.organization_memberships (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected', 'left')),
  approved_at timestamptz,
  left_at timestamptz,
  created_at timestamptz default now() not null
);
create unique index organization_memberships_one_org_per_trainer
  on public.organization_memberships (trainer_id) where status in ('pending', 'approved');
create index organization_memberships_org_idx on public.organization_memberships (organization_id);

-- 行があればトレーナー。
create table public.trainer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz default now() not null
);

-- 支払う人（個人トレーナー or ジム経営者）単位の契約。1〜3人の無料段階では行を作らない。
-- tier の定義（上限人数・Stripe Price ID）はコード側の設定に置く（DBに数字を持たない）。
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  owner_user_id uuid not null unique references public.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  status text not null,
  tier text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- exercise_master に無いトレーナー独自の種目。
create table public.trainer_exercises (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  target_muscle text,
  is_bodyweight boolean not null default false,
  is_compound boolean not null default false,
  created_at timestamptz default now() not null
);
create index trainer_exercises_trainer_idx on public.trainer_exercises (trainer_id);

-- ---------------------------------------------------------------------------
-- 契約・招待
-- ---------------------------------------------------------------------------

-- トレーナーとトレーニーの契約。招待発行時に invited（trainee_id = null）で作り、
-- 招待コード入力で active。サブスク切れで paused、契約終了で ended。
-- トレーナー自身との契約（trainer_id = trainee_id）はトレーナー登録時に自動作成する。
create table public.trainer_trainee_links (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid not null references public.users(id) on delete cascade,
  trainee_id uuid references public.users(id) on delete cascade,
  trainee_display_name text not null,
  status text not null check (status in ('invited', 'active', 'paused', 'ended')),
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now() not null,
  check (status = 'invited' or trainee_id is not null),
  check (status not in ('active', 'paused', 'ended') or started_at is not null),
  check (status <> 'ended' or ended_at is not null)
);
-- トレーニーが同時に持てる有効な契約は1件（自分自身との契約は対象外）。
create unique index trainer_trainee_links_one_active_per_trainee
  on public.trainer_trainee_links (trainee_id)
  where status in ('active', 'paused') and trainer_id <> trainee_id;
-- 自分自身との契約は1トレーナー1件。
create unique index trainer_trainee_links_one_self_link
  on public.trainer_trainee_links (trainer_id) where trainee_id = trainer_id;
create index trainer_trainee_links_trainer_idx on public.trainer_trainee_links (trainer_id, status);
create index trainer_trainee_links_trainee_idx on public.trainer_trainee_links (trainee_id, status);

-- トレーニーごとの使い捨て招待コード。期限切れは同じlinkに再発行する。
create table public.trainer_invites (
  id uuid default gen_random_uuid() primary key,
  link_id uuid not null references public.trainer_trainee_links(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null
);
create index trainer_invites_link_idx on public.trainer_invites (link_id);

-- ---------------------------------------------------------------------------
-- コーチングプラン（値を具体的に保存する。セルフモードの programs 系とは別）
-- ---------------------------------------------------------------------------

-- link_id = null はテンプレート。共有時はテンプレートを複製して link に紐付ける。
create table public.coaching_plans (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid not null references public.users(id) on delete cascade,
  link_id uuid references public.trainer_trainee_links(id) on delete cascade,
  name text not null,
  total_weeks smallint not null check (total_weeks >= 1),
  status text not null check (status in ('draft', 'shared', 'active', 'ended')),
  source text not null check (source in ('engine', 'template', 'blank')),
  based_on_plan_id uuid references public.coaching_plans(id) on delete set null,
  generation_inputs jsonb,
  shared_at timestamptz,
  started_at timestamptz,
  current_week smallint not null default 1 check (current_week >= 1),
  current_week_started_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  check (link_id is not null or status = 'draft')
);
-- 1つの契約で同時に進行（共有済み・開始済み）できるプランは1つ。次のプランの下書きは並行して作れる。
create unique index coaching_plans_one_live_per_link
  on public.coaching_plans (link_id) where status in ('shared', 'active');
create index coaching_plans_trainer_idx on public.coaching_plans (trainer_id);

create table public.plan_days (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid not null references public.coaching_plans(id) on delete cascade,
  week_number smallint not null check (week_number >= 1),
  day_number smallint not null check (day_number between 1 and 7),
  label text,
  created_at timestamptz default now() not null,
  unique (plan_id, week_number, day_number)
);

-- 種目は exercise_master か trainer_exercises のどちらか一方を参照する。
create table public.plan_exercises (
  id uuid default gen_random_uuid() primary key,
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  exercise_master_id uuid references public.exercise_master(id),
  trainer_exercise_id uuid references public.trainer_exercises(id),
  sort_order smallint not null default 0,
  note text,
  created_at timestamptz default now() not null,
  check (num_nonnulls(exercise_master_id, trainer_exercise_id) = 1)
);
create index plan_exercises_day_idx on public.plan_exercises (plan_day_id);

-- target_weight_kg = null は「前回記録から自動提案」（自重種目は exercise の is_bodyweight で区別）。
create table public.plan_sets (
  id uuid default gen_random_uuid() primary key,
  plan_exercise_id uuid not null references public.plan_exercises(id) on delete cascade,
  set_number smallint not null check (set_number >= 1),
  target_weight_kg numeric,
  target_reps smallint not null check (target_reps >= 1),
  target_rir smallint,
  is_warmup boolean not null default false,
  trainer_adjusted boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  unique (plan_exercise_id, set_number)
);

-- トレーニーが意図的に飛ばした種目（記録しないと「やらなかった」と区別できないため）。
create table public.plan_exercise_skips (
  id uuid default gen_random_uuid() primary key,
  plan_exercise_id uuid not null unique references public.plan_exercises(id) on delete cascade,
  trainee_id uuid not null references public.users(id) on delete cascade,
  skipped_at timestamptz default now() not null
);

-- 記録とプランを種目単位で紐付ける。セルフモードの記録とトレーニーが追加した種目は null。
-- トレーナー側の削除でプランが消えても記録は残す（SET NULL）。
alter table public.training_sets
  add column plan_exercise_id uuid references public.plan_exercises(id) on delete set null;
create index training_sets_plan_exercise_idx
  on public.training_sets (plan_exercise_id) where plan_exercise_id is not null;

-- ---------------------------------------------------------------------------
-- 権限判定の関数（RLSとAPIの両方から使う）
-- ---------------------------------------------------------------------------

-- ログイン中のトレーナーが、p_trainee の p_trained_on 時点の記録を閲覧できるか。
--   active : 契約開始日以降の記録
--   ended  : 契約期間内（開始日〜終了日）の記録。サブスク切れ中でも閲覧可
--   paused / invited : 不可
-- 自分自身との契約は対象外（本人としてのRLSで読める）。
create or replace function public.can_trainer_view(p_trainee uuid, p_trained_on date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from trainer_trainee_links l
    where l.trainer_id = auth.uid()
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.started_at::date <= p_trained_on
      and (
        l.status = 'active'
        or (l.status = 'ended' and p_trained_on <= l.ended_at::date)
      )
  );
$$;

-- 期間で区切れないデータ（自己ベスト・1RM）用。契約中（active）のトレーナーだけ。
create or replace function public.is_active_trainer_of(p_trainee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from trainer_trainee_links l
    where l.trainer_id = auth.uid()
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.status = 'active'
  );
$$;

-- 記録の種目名を表示するため。契約中か契約終了済み（期間内の記録を閲覧できる）のトレーナー。
create or replace function public.has_trainee_record_access(p_trainee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from trainer_trainee_links l
    where l.trainer_id = auth.uid()
      and l.trainee_id = p_trainee
      and l.trainer_id <> l.trainee_id
      and l.status in ('active', 'ended')
  );
$$;

-- プランを読めるか。作成したトレーナーは常に可。トレーニーは契約中で共有済み・開始済みのものだけ。
create or replace function public.can_read_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from coaching_plans p
    left join trainer_trainee_links l on l.id = p.link_id
    where p.id = p_plan_id
      and (
        p.trainer_id = auth.uid()
        or (
          l.trainee_id = auth.uid()
          and l.status = 'active'
          and p.status in ('shared', 'active')
        )
      )
  );
$$;

-- 組織まわりの判定。organizations と organization_memberships のポリシーが互いを参照すると
-- RLSの評価が無限再帰になるため、SECURITY DEFINER 関数で判定する。
create or replace function public.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from organizations o where o.id = p_org and o.owner_user_id = auth.uid());
$$;

create or replace function public.is_approved_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_memberships m
    where m.organization_id = p_org and m.trainer_id = auth.uid() and m.status = 'approved'
  );
$$;

-- ログイン中の経営者の組織に、p_trainer が所属（申請中を含む）しているか。
create or replace function public.is_org_owner_of_trainer(p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_memberships m
    join organizations o on o.id = m.organization_id
    where m.trainer_id = p_trainer and o.owner_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- training_sets.plan_exercise_id の検証（他人のプランを指定させない）
-- ---------------------------------------------------------------------------

-- 記録の保存はトレーニー本人のJWT（RLS）で行うため、plan_exercise_id に任意のIDを入れられる。
-- セッションの持ち主が、そのプランの契約の trainee（契約中）であることをトリガーで保証する。
create or replace function public.check_training_set_plan_exercise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_exercise_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from training_sessions s
    join plan_exercises pe on pe.id = new.plan_exercise_id
    join plan_days d on d.id = pe.plan_day_id
    join coaching_plans p on p.id = d.plan_id
    join trainer_trainee_links l on l.id = p.link_id
    where s.id = new.session_id
      and l.trainee_id = s.user_id
      and l.status = 'active'
      and p.status in ('shared', 'active')
  ) then
    raise exception 'plan_exercise_id % is not part of an active plan for this trainee', new.plan_exercise_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger training_sets_check_plan_exercise
  before insert or update of plan_exercise_id, session_id on public.training_sets
  for each row execute function public.check_training_set_plan_exercise();

-- ---------------------------------------------------------------------------
-- 新規テーブル: RLS有効化・クライアントからの書き込み権限の剥奪
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_invites enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trainer_exercises enable row level security;
alter table public.trainer_trainee_links enable row level security;
alter table public.trainer_invites enable row level security;
alter table public.coaching_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.plan_sets enable row level security;
alter table public.plan_exercise_skips enable row level security;

revoke insert, update, delete, truncate on
  public.organizations, public.organization_invites, public.organization_memberships,
  public.trainer_profiles, public.subscriptions, public.trainer_exercises,
  public.trainer_trainee_links, public.trainer_invites,
  public.coaching_plans, public.plan_days, public.plan_exercises, public.plan_sets,
  public.plan_exercise_skips
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 新規テーブル: SELECTポリシー
-- ---------------------------------------------------------------------------

create policy "organizations: owner or approved member" on public.organizations
  for select using (owner_user_id = auth.uid() or public.is_approved_org_member(id));

create policy "organization_invites: owner" on public.organization_invites
  for select using (public.is_org_owner(organization_id));

create policy "organization_memberships: own or org owner" on public.organization_memberships
  for select using (trainer_id = auth.uid() or public.is_org_owner(organization_id));

-- 本人、契約中のトレーニー（担当トレーナーの表示名）、所属組織の経営者。
create policy "trainer_profiles: self, own trainees, org owner" on public.trainer_profiles
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trainer_trainee_links l
      where l.trainer_id = trainer_profiles.user_id and l.trainee_id = auth.uid() and l.status in ('active', 'paused')
    )
    or public.is_org_owner_of_trainer(user_id)
  );

create policy "subscriptions: owner" on public.subscriptions
  for select using (owner_user_id = auth.uid());

create policy "trainer_exercises: owner or active trainee" on public.trainer_exercises
  for select using (
    trainer_id = auth.uid()
    or exists (
      select 1 from public.trainer_trainee_links l
      where l.trainer_id = trainer_exercises.trainer_id and l.trainee_id = auth.uid() and l.status = 'active'
    )
  );

create policy "trainer_trainee_links: trainer or trainee" on public.trainer_trainee_links
  for select using (trainer_id = auth.uid() or trainee_id = auth.uid());

create policy "trainer_invites: trainer of the link" on public.trainer_invites
  for select using (
    exists (select 1 from public.trainer_trainee_links l where l.id = link_id and l.trainer_id = auth.uid())
  );

create policy "coaching_plans: readable" on public.coaching_plans
  for select using (public.can_read_plan(id));

create policy "plan_days: readable plan" on public.plan_days
  for select using (public.can_read_plan(plan_id));

create policy "plan_exercises: readable plan" on public.plan_exercises
  for select using (
    exists (select 1 from public.plan_days d where d.id = plan_day_id and public.can_read_plan(d.plan_id))
  );

create policy "plan_sets: readable plan" on public.plan_sets
  for select using (
    exists (
      select 1 from public.plan_exercises pe
      join public.plan_days d on d.id = pe.plan_day_id
      where pe.id = plan_exercise_id and public.can_read_plan(d.plan_id)
    )
  );

-- 本人、または契約期間内のトレーナー（スキップした日で判定）。
create policy "plan_exercise_skips: trainee or viewing trainer" on public.plan_exercise_skips
  for select using (
    trainee_id = auth.uid()
    or public.can_trainer_view(trainee_id, skipped_at::date)
  );

-- ---------------------------------------------------------------------------
-- 既存テーブル: トレーナー用のSELECTポリシーを追加（本人用の既存ポリシーはそのまま）
-- ---------------------------------------------------------------------------

create policy "training_sessions: viewing trainer" on public.training_sessions
  for select using (public.can_trainer_view(user_id, trained_at));

create policy "training_sets: viewing trainer" on public.training_sets
  for select using (
    exists (
      select 1 from public.training_sessions s
      where s.id = session_id and public.can_trainer_view(s.user_id, s.trained_at)
    )
  );

create policy "user_exercises: trainer with record access" on public.user_exercises
  for select using (public.has_trainee_record_access(user_id));

create policy "exercise_bests: active trainer" on public.exercise_bests
  for select using (public.is_active_trainer_of(user_id));

create policy "user_slot_one_rms: active trainer" on public.user_slot_one_rms
  for select using (public.is_active_trainer_of(user_id));

commit;
