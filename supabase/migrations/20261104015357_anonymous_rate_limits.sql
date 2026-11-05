-- Student browsing is anonymous. Rate controls belong on trusted server requests, not accounts.
create table archride_private.request_limits (
 scope text not null,
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 hits integer not null check(hits>0),
 expires_at timestamptz not null,
 primary key(scope,key_hash)
);
create index request_limits_expiry on archride_private.request_limits(expires_at);
create table archride_private.request_leases (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('read','walking','report')),
 expires_at timestamptz not null
);
create index request_leases_expiry on archride_private.request_leases(expires_at);
alter table archride_private.request_limits enable row level security;
alter table archride_private.request_leases enable row level security;
revoke all on archride_private.request_limits,archride_private.request_leases from public,anon,authenticated;
grant all on archride_private.request_limits,archride_private.request_leases to service_role;
create function archride_private.admit_public_request(p_scope text,p_hash text) returns table(allowed boolean,retry_after integer,lease_id uuid)
language plpgsql security invoker set search_path='' as $$
declare seconds integer; network_limit integer; global_limit integer; global_hits integer; network_hits integer; boundary timestamptz; slot uuid; max_concurrent integer;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_hash=repeat('0',64) then raise exception 'invalid_network_key'; end if;
 case p_scope
  when 'read' then seconds:=60;network_limit:=3600;global_limit:=12000;max_concurrent:=20;
  when 'walking' then seconds:=60;network_limit:=180;global_limit:=600;max_concurrent:=2;
  when 'report' then seconds:=3600;network_limit:=120;global_limit:=2000;max_concurrent:=2;
  else raise exception 'invalid_scope';
 end case;
 boundary:=to_timestamp(floor(extract(epoch from clock_timestamp())/seconds)*seconds);
 -- A short transaction serializes admission only; upstream work runs outside this lock.
 perform pg_advisory_xact_lock(hashtext('archride-public-admission'));
 delete from archride_private.request_leases where expires_at<=clock_timestamp();
 delete from archride_private.request_limits where expires_at<=clock_timestamp();
 insert into archride_private.request_limits(scope,key_hash,window_start,hits,expires_at) values(p_scope,repeat('0',64),boundary,1,boundary+make_interval(secs=>seconds+60))
 on conflict(scope,key_hash) do update set hits=case when request_limits.window_start=excluded.window_start then request_limits.hits+1 else 1 end,window_start=excluded.window_start,expires_at=excluded.expires_at returning hits into global_hits;
 if global_hits>global_limit then return query select false,greatest(1,ceil(extract(epoch from boundary+make_interval(secs=>seconds)-clock_timestamp()))::integer),null::uuid;return;end if;
 -- A hard cap bounds distinct network buckets even if traffic comes from many networks.
 if not exists(select 1 from archride_private.request_limits where scope=p_scope and key_hash=p_hash) and (select count(*) from archride_private.request_limits)>=10000 then return query select false,60,null::uuid;return;end if;
 insert into archride_private.request_limits(scope,key_hash,window_start,hits,expires_at) values(p_scope,p_hash,boundary,1,boundary+make_interval(secs=>seconds+60))
 on conflict(scope,key_hash) do update set hits=case when request_limits.window_start=excluded.window_start then request_limits.hits+1 else 1 end,window_start=excluded.window_start,expires_at=excluded.expires_at returning hits into network_hits;
 if network_hits>network_limit then return query select false,greatest(1,ceil(extract(epoch from boundary+make_interval(secs=>seconds)-clock_timestamp()))::integer),null::uuid;return;end if;
 if (select count(*) from archride_private.request_leases)>=24 or (select count(*) from archride_private.request_leases where scope=p_scope)>=max_concurrent then return query select false,1,null::uuid;return;end if;
 insert into archride_private.request_leases(scope,expires_at) values(p_scope,clock_timestamp()+interval '30 seconds') returning id into slot;
 return query select true,0,slot;
end;
$$;
revoke all on function archride_private.admit_public_request(text,text) from public,anon,authenticated;
grant execute on function archride_private.admit_public_request(text,text) to service_role;

-- No student identifier, network hash, GPS position, or device ID is stored with a report.
create table archride_private.anonymous_rider_reports (
 id uuid primary key default gen_random_uuid(),
 arrival_id text not null check(char_length(arrival_id) between 1 and 200),
 event_kind text not null check(event_kind in ('arrival','departure','boarding')),
 event_at timestamptz not null,
 uploaded_at timestamptz not null default clock_timestamp(),
 trip_id text,route_id text,stop_id text,instance_key text,stop_sequence integer,
 validation_state text not null check(validation_state in ('plausible','accepted','rejected')),
 reason text not null,
 matched_observed_at timestamptz,
 unique(instance_key,stop_sequence,event_kind),
 check(event_at<=uploaded_at+interval '15 seconds' and event_at>=uploaded_at-interval '1 hour')
);
create index anonymous_reports_expiry on archride_private.anonymous_rider_reports(uploaded_at);
create index anonymous_reports_occurrence on archride_private.anonymous_rider_reports(instance_key,trip_id,stop_sequence) where validation_state='plausible';
alter table archride_private.anonymous_rider_reports enable row level security;
revoke all on archride_private.anonymous_rider_reports from public,anon,authenticated;
grant all on archride_private.anonymous_rider_reports to service_role;
create function archride_private.submit_anonymous_report(p_arrival text,p_kind text,p_at timestamptz) returns table(validation_state text,reason text,duplicate boolean)
language plpgsql security invoker set search_path='' as $$
declare snapshot record; state text:='rejected'; why text:='source_match_unavailable'; inserted uuid;
begin
 if p_arrival is null or char_length(p_arrival) not between 1 and 200 or p_kind not in ('arrival','departure','boarding') or p_at>clock_timestamp()+interval '15 seconds' or p_at<clock_timestamp()-interval '1 hour' then raise exception 'invalid_report';end if;
 select * into snapshot from archride_private.arrival_predictions p where p.id=p_arrival and p.relationship='SCHEDULED' and p.arrival_at is not null and p.received_at<=p_at+interval '2 minutes' and p.update_timestamp<=p_at+interval '15 seconds' and p.received_at-p.update_timestamp<=interval '90 seconds' and p.valid_until>p.received_at order by p.update_timestamp desc limit 1;
 if found then
  if abs(extract(epoch from(p_at-snapshot.arrival_at)))<=600 then state:='plausible';why:=case when p_kind='departure' then 'departure_confirmation_unavailable' else 'awaiting_independent_confirmation' end;else why:='timing_outlier';end if;
 end if;
 insert into archride_private.anonymous_rider_reports(arrival_id,event_kind,event_at,trip_id,route_id,stop_id,instance_key,stop_sequence,validation_state,reason) values(p_arrival,p_kind,p_at,snapshot.trip_id,snapshot.route_id,snapshot.stop_id,snapshot.instance_key,snapshot.stop_sequence,state,why) on conflict(instance_key,stop_sequence,event_kind) do nothing returning id into inserted;
 return query select state,why,inserted is null;
end;
$$;
revoke all on function archride_private.submit_anonymous_report(text,text,timestamptz) from public,anon,authenticated;
grant execute on function archride_private.submit_anonymous_report(text,text,timestamptz) to service_role;
create function archride_private.confirm_anonymous_reports() returns void language plpgsql security invoker set search_path='' as $$
begin
 update archride_private.anonymous_rider_reports r set validation_state='accepted',reason='official_stop_arrival',matched_observed_at=e.observed_at
 from public.transit_arrival_events e where r.validation_state='plausible' and r.event_kind in ('arrival','boarding') and e.evidence='source_vehicle_stopped_at' and e.instance_key=r.instance_key and e.trip_id=r.trip_id and e.stop_id=r.stop_id and e.stop_sequence=r.stop_sequence and abs(extract(epoch from(e.observed_at-r.event_at)))<=90;
 update archride_private.anonymous_rider_reports set validation_state='rejected',reason='confirmation_expired' where validation_state='plausible' and uploaded_at<now()-interval '24 hours';
 delete from archride_private.anonymous_rider_reports where uploaded_at<now()-interval '30 days' or (validation_state='rejected' and uploaded_at<now()-interval '7 days');
 delete from archride_private.request_limits where expires_at<=clock_timestamp();
 delete from archride_private.request_leases where expires_at<=clock_timestamp();
end;
$$;
revoke all on function archride_private.confirm_anonymous_reports() from public,anon,authenticated;
grant execute on function archride_private.confirm_anonymous_reports() to service_role;

-- Direct PostgREST reads would bypass network admission. The public-read Edge proxy owns
-- the bounded public field allowlist; privileged workers/admin retain their existing access.
revoke select on public.transit_sources,public.transit_buildings,public.transit_entrances,public.transit_routes,public.transit_stops,public.transit_shapes,public.transit_services,public.transit_trips,public.transit_stop_times,public.transit_frequencies,public.transit_vehicles,public.transit_arrivals,public.transit_alerts,public.transit_alert_entities,public.transit_walking_cache,public.feed_status,public.manual_notices from anon,authenticated;
-- HOSTED INFRASTRUCTURE:
select cron.schedule('archride-anonymous-report-validation','29 * * * *','select archride_private.confirm_anonymous_reports()');
select cron.schedule('archride-public-limit-retention','* * * * *','delete from archride_private.request_limits where expires_at<=clock_timestamp(); delete from archride_private.request_leases where expires_at<=clock_timestamp();');
