-- Cover source foreign keys used by refresh, retention and operator queries.
create index transit_alerts_source on public.transit_alerts(source_id);
create index transit_arrivals_source on public.transit_arrivals(source_id);
create index transit_services_source on public.transit_services(source_id);
create index transit_shapes_source on public.transit_shapes(source_id);
create index transit_vehicles_source on public.transit_vehicles(source_id);

-- Explicit deny policies document the private tables' intentional fail-closed access.
create policy "No browser access" on public.transit_observations for all to anon, authenticated using(false) with check(false);
create policy "No browser access" on public.transit_arrival_events for all to anon, authenticated using(false) with check(false);
create policy "No browser access" on public.transit_job_runs for all to anon, authenticated using(false) with check(false);
create policy "No browser access" on public.transit_retention for all to anon, authenticated using(false) with check(false);

create schema if not exists archride_private;
revoke all on schema archride_private from public, anon, authenticated;
grant usage on schema archride_private to service_role;
create table archride_private.transit_job_config (
 id boolean primary key default true check(id), project_url text,
 token_hash text,
 realtime_enabled boolean not null default false,
 approved_interval_seconds integer check(approved_interval_seconds>=30),
 rate_evidence text,
 check(not realtime_enabled or (approved_interval_seconds is not null and rate_evidence is not null and length(rate_evidence)>0))
);
alter table archride_private.transit_job_config enable row level security;
revoke all on archride_private.transit_job_config from public, anon, authenticated;
grant all on archride_private.transit_job_config to service_role;
insert into archride_private.transit_job_config(id) values(true);

-- HOSTED INFRASTRUCTURE: extensions are integration-tested against hosted Supabase.
-- PGlite applies the portable schema above; it cannot emulate pg_net/cron/Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='archride_transit_job_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'archride_transit_job_token','ArchRide central ingestion only');
 end if;
 update archride_private.transit_job_config set token_hash=(
  select encode(extensions.digest(decrypted_secret,'sha256'),'hex') from vault.decrypted_secrets where name='archride_transit_job_token'
 ) where id;
end $$;

-- Invoker only: callable by the trusted scheduler/operator, never a public RPC.
create function archride_private.dispatch_transit(p_mode text default 'static') returns bigint
language plpgsql security invoker set search_path='' as $$
declare cfg archride_private.transit_job_config; token text; request_id bigint;
begin
 select * into cfg from archride_private.transit_job_config where id;
 if cfg.project_url is null then return null; end if;
 if p_mode not in ('static','all','scheduled') then raise exception 'invalid_mode'; end if;
 if p_mode='scheduled' then
  if not cfg.realtime_enabled then return null; end if;
  -- Minute cron respects any longer approved interval and provider cooldowns in the worker.
  if exists(select 1 from public.feed_status where id='uga-passio:vehicles'
      and last_attempt_at>now()-make_interval(secs=>cfg.approved_interval_seconds)) then return null; end if;
  p_mode:='all';
 end if;
 if p_mode='static' and exists(select 1 from public.feed_status where id='uga-passio:static'
    and (last_success_at>now()-interval '24 hours' or next_attempt_at>now())) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='archride_transit_job_token';
 select net.http_post(url=>cfg.project_url||'/functions/v1/transit-ingest',
  headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  body=>jsonb_build_object('mode',p_mode),timeout_milliseconds=>120000) into request_id;
 return request_id;
end $$;
revoke all on function archride_private.dispatch_transit(text) from public, anon, authenticated;
grant execute on function archride_private.dispatch_transit(text) to service_role;

select cron.schedule('archride-static-refresh','17 * * * *',$job$select archride_private.dispatch_transit('static');$job$);
-- Safe until an operator records provider approval and flips realtime_enabled.
select cron.schedule('archride-realtime-refresh','* * * * *',$job$select archride_private.dispatch_transit('scheduled');$job$);
