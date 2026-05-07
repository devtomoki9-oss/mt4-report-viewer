-- Web Push subscriptions (endpoint + ECDH keys per user/device)
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now(),
  unique (user_id, endpoint)
);
alter table push_subscriptions enable row level security;
create policy "push_subscriptions: own rows" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-account loss alert thresholds
create table if not exists alert_settings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users on delete cascade not null,
  account_number   text not null,
  loss_threshold   numeric not null,      -- positive value; alert fires when totalNet < -loss_threshold
  last_notified_at timestamptz,
  created_at       timestamptz default now(),
  unique (user_id, account_number)
);
alter table alert_settings enable row level security;
create policy "alert_settings: own rows" on alert_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
