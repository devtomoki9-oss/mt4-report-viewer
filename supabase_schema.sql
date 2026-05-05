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

-- ============================================================
-- ea_params テーブル（EA パラメータ管理 / Phase 2: 任意EA対応）
--   key = (user_id, account_number, chart_id)
--   chart_id は EA インスタンスを一意に識別するキー（例: "EURUSD#H1#12345"）
--   manifest: EA起動時にMT側が書く（型・既定値・range など）
--   desired : Web が書き、MT が読む
--   actual  : MT が書き、Web が読む
-- ============================================================
create table if not exists ea_params (
  user_id        uuid references auth.users not null,
  account_number bigint not null,
  chart_id       text not null,
  ea_name        text,
  symbol         text,
  timeframe      text,
  manifest       jsonb,
  desired        jsonb,
  actual         jsonb,
  manifest_at    timestamptz,
  desired_at     timestamptz,
  actual_at      timestamptz,
  updated_at     timestamptz default now(),
  primary key (user_id, account_number, chart_id)
);

drop trigger if exists ea_params_updated_at on ea_params;
create trigger ea_params_updated_at
  before update on ea_params
  for each row execute function update_updated_at();

alter table ea_params enable row level security;

drop policy if exists "select own ea_params" on ea_params;
create policy "select own ea_params"
  on ea_params for select
  using (auth.uid() = user_id);

drop policy if exists "insert own ea_params" on ea_params;
create policy "insert own ea_params"
  on ea_params for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own ea_params" on ea_params;
create policy "update own ea_params"
  on ea_params for update
  using (auth.uid() = user_id);

drop policy if exists "delete own ea_params" on ea_params;
create policy "delete own ea_params"
  on ea_params for delete
  using (auth.uid() = user_id);

-- upsert_ea_param_manifest: MT 側からマニフェストと現在値をアップサート
-- 「desired が actual より古い or 未設定」なら、MT 側手動変更とみなして
-- desired を actual で追従させる（Web の表示値が MT 側の真値に揃う）。
create or replace function upsert_ea_param_manifest(
  p_account_number bigint,
  p_chart_id       text,
  p_ea_name        text,
  p_symbol         text,
  p_timeframe      text,
  p_manifest       jsonb,
  p_actual         jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ea_params (
    user_id, account_number, chart_id, ea_name, symbol, timeframe,
    manifest, actual, desired, manifest_at, actual_at, desired_at, updated_at
  )
  values (
    auth.uid(), p_account_number, p_chart_id, p_ea_name, p_symbol, p_timeframe,
    p_manifest, p_actual, p_actual, now(), now(), now(), now()
  )
  on conflict (user_id, account_number, chart_id)
  do update set
    ea_name     = excluded.ea_name,
    symbol      = excluded.symbol,
    timeframe   = excluded.timeframe,
    manifest    = excluded.manifest,
    actual      = excluded.actual,
    desired     = case
                    when ea_params.desired_at is null
                      or ea_params.actual_at  is null
                      or ea_params.desired_at <= ea_params.actual_at
                    then excluded.actual
                    else ea_params.desired
                  end,
    desired_at  = case
                    when ea_params.desired_at is null
                      or ea_params.actual_at  is null
                      or ea_params.desired_at <= ea_params.actual_at
                    then now()
                    else ea_params.desired_at
                  end,
    manifest_at = now(),
    actual_at   = now(),
    updated_at  = now();
end;
$$;

-- upsert_ea_param_actual: MT 側から現在値のみをアップサート（マニフェスト不変時）
-- desired が actual より古い場合は手動変更とみなし、desired も追従させる。
create or replace function upsert_ea_param_actual(
  p_account_number bigint,
  p_chart_id       text,
  p_actual         jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ea_params
     set actual     = p_actual,
         desired    = case
                        when desired_at is null
                          or actual_at  is null
                          or desired_at <= actual_at
                        then p_actual
                        else desired
                      end,
         desired_at = case
                        when desired_at is null
                          or actual_at  is null
                          or desired_at <= actual_at
                        then now()
                        else desired_at
                      end,
         actual_at  = now(),
         updated_at = now()
   where user_id        = auth.uid()
     and account_number = p_account_number
     and chart_id       = p_chart_id;
end;
$$;

-- upsert_ea_param_desired: Web 側から希望値をアップサート
create or replace function upsert_ea_param_desired(
  p_account_number bigint,
  p_chart_id       text,
  p_desired        jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ea_params (
    user_id, account_number, chart_id, desired, desired_at, updated_at
  )
  values (
    auth.uid(), p_account_number, p_chart_id, p_desired, now(), now()
  )
  on conflict (user_id, account_number, chart_id)
  do update set
    desired    = p_desired,
    desired_at = now(),
    updated_at = now();
end;
$$;
