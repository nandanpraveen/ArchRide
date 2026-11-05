-- Large verified paths can still be returned, but cannot consume unbounded cache storage.
delete from public.transit_walking_cache where pg_column_size(geometry)>16384;
alter table public.transit_walking_cache add constraint walking_geometry_budget check(pg_column_size(geometry)<=16384);
create function archride_private.bound_walking_cache() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from public.transit_walking_cache where expires_at<now();
 with excess as (select id from public.transit_walking_cache order by fetched_at desc offset 2000 limit 1000)
 delete from public.transit_walking_cache r using excess e where r.id=e.id;
end;
$$;
revoke all on function archride_private.bound_walking_cache() from public,anon,authenticated;
grant execute on function archride_private.bound_walking_cache() to service_role;
-- HOSTED INFRASTRUCTURE:
select archride_private.bound_walking_cache();
select cron.schedule('archride-walking-cache-budget','*/10 * * * *','select archride_private.bound_walking_cache()');
