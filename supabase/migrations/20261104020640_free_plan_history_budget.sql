-- Free-plan storage is a constraint, not a reason to reduce authorized source cadence.
update public.transit_retention set observation_hours=12,prediction_hours=6,job_days=3 where id;
alter table public.transit_retention
 add column observation_max_rows integer not null default 200000 check(observation_max_rows between 1000 and 300000),
 add column prediction_max_rows integer not null default 200000 check(prediction_max_rows between 1000 and 300000),
 add column job_max_rows integer not null default 60000 check(job_max_rows between 1000 and 100000);
create function archride_private.enforce_history_budget() returns void language plpgsql security invoker set search_path='' as $$
declare cfg public.transit_retention;
begin
 if not pg_try_advisory_xact_lock(hashtext('archride-history-budget')) then return;end if;
 select * into cfg from public.transit_retention where id;
 delete from public.transit_observations where received_at<now()-make_interval(hours=>cfg.observation_hours);
 delete from archride_private.arrival_predictions where captured_at<now()-make_interval(hours=>cfg.prediction_hours);
 delete from public.transit_job_runs where finished_at<now()-make_interval(days=>cfg.job_days);
 -- Each scheduled run deletes at most50k excess rows per table. Indexed time order
 -- keeps cleanup bounded; latest state and independently observed arrival events stay intact.
 with excess as (select id,position_timestamp from public.transit_observations order by received_at desc offset cfg.observation_max_rows limit 50000)
 delete from public.transit_observations r using excess e where r.id=e.id and r.position_timestamp=e.position_timestamp;
 with excess as (select id,update_timestamp from archride_private.arrival_predictions order by captured_at desc offset cfg.prediction_max_rows limit 50000)
 delete from archride_private.arrival_predictions r using excess e where r.id=e.id and r.update_timestamp=e.update_timestamp;
 with excess as (select id from public.transit_job_runs order by finished_at desc offset cfg.job_max_rows limit 50000)
 delete from public.transit_job_runs r using excess e where r.id=e.id;
end;
$$;
revoke all on function archride_private.enforce_history_budget() from public,anon,authenticated;
grant execute on function archride_private.enforce_history_budget() to service_role;
-- HOSTED INFRASTRUCTURE:
select archride_private.enforce_history_budget();
select cron.schedule('archride-transit-retention','*/10 * * * *','select archride_private.cleanup_transit(); select archride_private.enforce_history_budget();');
select cron.schedule('archride-arrival-evaluation-retention','*/10 * * * *','select archride_private.enforce_history_budget();');
