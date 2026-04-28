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

-- sync スクリプト用：メールアドレスでユーザーIDを返すヘルパー関数
-- （サービスロールキー不要でupsertできるよう、REST経由で使用）
-- ※ この関数は不要な場合は削除してください
