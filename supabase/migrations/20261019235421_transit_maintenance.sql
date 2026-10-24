-- Retention must run even while realtime polling is awaiting provider approval.
create policy "No browser access" on archride_private.transit_job_config for all to anon, authenticated using(false) with check(false);
create function archride_private.cleanup_transit() returns void
language plpgsql security invoker set search_path='' as $$
begin
 delete from public.transit_observations where received_at<now()-make_interval(hours=>(select observation_hours from public.transit_retention where id));
 delete from public.transit_arrival_events where received_at<now()-make_interval(days=>(select event_days from public.transit_retention where id));
 delete from public.transit_job_runs where finished_at<now()-make_interval(days=>(select job_days from public.transit_retention where id));
 delete from public.transit_arrivals where valid_until<now();
 delete from public.transit_walking_cache where expires_at<now();
 delete from public.transit_vehicles where received_at<now()-interval '7 days';
 delete from public.transit_alerts where not active and received_at<now()-interval '7 days';
end $$;
revoke all on function archride_private.cleanup_transit() from public, anon, authenticated;
grant execute on function archride_private.cleanup_transit() to service_role;
-- HOSTED INFRASTRUCTURE: pg_cron is verified on the hosted project.
select cron.schedule('archride-transit-retention','43 * * * *',$job$select archride_private.cleanup_transit();$job$);
