-- ============================================================
-- mt4-report-viewer Supabase スキーマ
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================

-- reports テーブル
-- ユーザーごと・口座番号ごとに最新のJSONを1件保持する
create table if not exists reports (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users not null,
  account_number bigint not null,
  filename       text not null,
  data           jsonb not null,
  updated_at     timestamptz default now(),
  unique (user_id, account_number)
);

-- updated_at を自動更新するトリガー
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reports_updated_at on reports;
create trigger reports_updated_at
  before update on reports
  for each row execute function update_updated_at();

-- Row Level Security（ユーザーは自分のデータのみ操作可能）
alter table reports enable row level security;

drop policy if exists "select own reports" on reports;
create policy "select own reports"
  on reports for select
  using (auth.uid() = user_id);

drop policy if exists "insert own reports" on reports;
create policy "insert own reports"
  on reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own reports" on reports;
create policy "update own reports"
  on reports for update
  using (auth.uid() = user_id);

drop policy if exists "delete own reports" on reports;
create policy "delete own reports"
  on reports for delete
  using (auth.uid() = user_id);

-- upsert_report: syncスクリプトからレポートをアップサート
create or replace function upsert_report(
  p_account_number bigint,
  p_filename       text,
  p_data           jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into reports (user_id, account_number, filename, data, updated_at)
  values (auth.uid(), p_account_number, p_filename, p_data, now())
  on conflict (user_id, account_number)
  do update set filename = excluded.filename, data = excluded.data, updated_at = now();
end;
$$;

-- delete_own_account: ユーザー自身のアカウントを削除
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- ============================================================
-- ea_controls テーブル（AutoTrading ON/OFF 制御）
-- ============================================================
create table if not exists ea_controls (
  user_id        uuid references auth.users not null,
  account_number bigint not null,
  enabled        boolean not null default true,
  updated_at     timestamptz default now(),
  primary key (user_id, account_number)
);

drop trigger if exists ea_controls_updated_at on ea_controls;
create trigger ea_controls_updated_at
  before update on ea_controls
  for each row execute function update_updated_at();

alter table ea_controls enable row level security;

drop policy if exists "select own ea_controls" on ea_controls;
create policy "select own ea_controls"
  on ea_controls for select
  using (auth.uid() = user_id);

drop policy if exists "insert own ea_controls" on ea_controls;
create policy "insert own ea_controls"
  on ea_controls for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own ea_controls" on ea_controls;
create policy "update own ea_controls"
  on ea_controls for update
  using (auth.uid() = user_id);

drop policy if exists "delete own ea_controls" on ea_controls;
create policy "delete own ea_controls"
  on ea_controls for delete
  using (auth.uid() = user_id);

-- upsert_ea_control: AutoTrading状態をアップサート
create or replace function upsert_ea_control(
  p_account_number bigint,
  p_enabled        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ea_controls (user_id, account_number, enabled, updated_at)
  values (auth.uid(), p_account_number, p_enabled, now())
  on conflict (user_id, account_number)
  do update set enabled = excluded.enabled, updated_at = now();
end;
$$;

-- ============================================================
-- subscriptions テーブル（Lemon Squeezy サブスク管理）
-- ============================================================

create table if not exists subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'free',
  status                 text not null default 'inactive',
  lemon_subscription_id  text,
  current_period_end     timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

drop trigger if exists subscriptions_updated_at on subscriptions;
create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function update_updated_at();

alter table subscriptions enable row level security;

drop policy if exists "users can read own subscription" on subscriptions;
create policy "users can read own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);
