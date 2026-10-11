-- Device subscriptions are private. No client role may read or modify these tables.
create table if not exists public.atlas_push_config (
  id integer primary key check (id=1),
  vapid_public text not null, vapid_private text not null, admin_token text not null,
  last_polled_at timestamptz
);
create table if not exists public.atlas_push_devices (
  token_hash text primary key, subscription jsonb not null,
  endpoint_hash text unique not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_test_at timestamptz
);
create table if not exists public.atlas_push_deliveries (
  event_id text not null, token_hash text not null references public.atlas_push_devices(token_hash) on delete cascade,
  sent_at timestamptz not null default now(), primary key(event_id,token_hash)
);
create table if not exists public.atlas_push_events (
  id text primary key, published_at timestamptz not null, title text not null,
  body text not null, received_at timestamptz not null default now()
);
alter table public.atlas_push_config enable row level security;
alter table public.atlas_push_devices enable row level security;
alter table public.atlas_push_deliveries enable row level security;
alter table public.atlas_push_events enable row level security;
revoke all on public.atlas_push_config, public.atlas_push_devices, public.atlas_push_deliveries, public.atlas_push_events from anon, authenticated;
grant select,insert,update,delete on public.atlas_push_config, public.atlas_push_devices, public.atlas_push_deliveries, public.atlas_push_events to service_role;
