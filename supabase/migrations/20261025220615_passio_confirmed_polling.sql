-- Request-start clocks are separate from source data and completion/health clocks.
create table archride_private.transit_poll_state (
 feed_id text primary key references public.feed_status(id),
 last_started_at timestamptz not null default '-infinity',
 failures integer not null default 0 check(failures between 0 and 10)
);
alter table archride_private.transit_poll_state enable row level security;
revoke all on archride_private.transit_poll_state from public, anon, authenticated;
grant select,update on archride_private.transit_poll_state to service_role;
create policy "No browser poll state" on archride_private.transit_poll_state for all to anon,authenticated using(false) with check(false);
insert into archride_private.transit_poll_state(feed_id,last_started_at)
 select id,coalesce(last_attempt_at,'-infinity') from public.feed_status
 where id in ('uga-passio:vehicles','uga-passio:arrivals','uga-passio:alerts');
-- Indefinite caching is permitted, not required. Bound high-frequency history growth.
alter table public.transit_retention add column prediction_hours integer not null default 24 check(prediction_hours between 1 and 168);
comment on column archride_private.transit_job_config.approved_interval_seconds is 'Legacy shared interval; per-feed policy in scripts/transit/cadence.ts supersedes this field.';
update archride_private.transit_job_config set realtime_enabled=true,approved_interval_seconds=30,
 rate_evidence='Passio reply supplied by owner 2026-10-25: vehicles 10s; trip updates 30s; alerts 120s; indefinite caching permitted.' where id;
-- HOSTED INFRASTRUCTURE:
create or replace function archride_private.dispatch_transit(p_mode text default 'static') returns bigint
language plpgsql security invoker set search_path='' as $$
declare cfg archride_private.transit_job_config; token text; request_id bigint;
begin
 select * into cfg from archride_private.transit_job_config where id;
 if cfg.project_url is null then return null; end if;
 if p_mode not in ('static','all','scheduled') then raise exception 'invalid_mode'; end if;
 if p_mode='scheduled' and not cfg.realtime_enabled then return null; end if;
 if p_mode='static' and exists(select 1 from public.feed_status where id='uga-passio:static'
    and (last_success_at>now()-interval '24 hours' or next_attempt_at>now())) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='archride_transit_job_token';
 select net.http_post(url=>cfg.project_url||'/functions/v1/transit-ingest',
  headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  body=>jsonb_build_object('mode',p_mode),timeout_milliseconds=>120000) into request_id;
 return request_id;
end $$;
revoke all on function archride_private.dispatch_transit(text) from public,anon,authenticated;
grant execute on function archride_private.dispatch_transit(text) to service_role;
-- One central worker invocation; each feed independently reserves only due requests.
select cron.schedule('archride-realtime-refresh','10 seconds',$$select archride_private.dispatch_transit('scheduled');$$);
select cron.schedule('archride-arrival-evaluation-retention','17 * * * *',
 $$delete from archride_private.arrival_predictions where captured_at < now()-make_interval(hours => (select prediction_hours from public.transit_retention where id))$$);
select cron.schedule('archride-cron-log-retention','23 * * * *',
 $$delete from cron.job_run_details where end_time < now()-interval '2 days' and jobid in(select jobid from cron.job where jobname like 'archride-%')$$);

-- Enable only after the compatible worker is deployed and verified (runbook).
select cron.alter_job((select jobid from cron.job where jobname='archride-realtime-refresh'),active=>false);
