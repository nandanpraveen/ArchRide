-- Subscription capabilities are private, separate from student accounts and the Data API.
create table archride_private.push_devices (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  endpoint_hash text not null unique check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object' and octet_length(subscription::text) < 4096),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) < 65536),
  handled jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 days',
  checked_at timestamptz not null default '-infinity'
);
create index push_devices_expiry on archride_private.push_devices(expires_at);
create index push_devices_checked on archride_private.push_devices(checked_at);
alter table archride_private.push_devices enable row level security;
revoke all on archride_private.push_devices from public, anon, authenticated;
grant select, insert, update, delete on archride_private.push_devices to service_role;

-- HOSTED INFRASTRUCTURE: pg_cron/pg_net and Vault already support the transit job.
-- Configure PUSH_JOB_TOKEN to match the dedicated Vault push_job_token before enabling.
-- Run docs/browser-notifications.md's activation SQL after deploying the function.
