-- Optional rider observations contain event time, never a rider GPS position.
create table public.rider_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 arrival_id text not null check(char_length(arrival_id) between 1 and 200),
 event_kind text not null check(event_kind in ('arrival','departure','boarding')),
 event_at timestamptz not null,
 uploaded_at timestamptz not null default now(),
 trip_id text,route_id text,stop_id text,instance_key text,stop_sequence integer,
 validation_state text not null default 'plausible' check(validation_state in ('plausible','accepted','rejected')),
 reason text not null default '',
 matched_observed_at timestamptz,
 unique(user_id,instance_key,stop_sequence,event_kind),
 check(event_at <= uploaded_at + interval '15 seconds' and event_at >= uploaded_at - interval '1 hour')
);
create index rider_reports_owner_time on public.rider_reports(user_id,uploaded_at desc);
create index rider_reports_occurrence on public.rider_reports(instance_key,stop_sequence,event_at) where validation_state='plausible';
create index rider_reports_retention on public.rider_reports(uploaded_at);
alter table public.rider_reports enable row level security;
revoke all on public.rider_reports from public,anon,authenticated;
grant select on public.rider_reports to authenticated;
grant insert(arrival_id,event_kind,event_at) on public.rider_reports to authenticated;
grant all on public.rider_reports to service_role;
create policy "Owners read reports" on public.rider_reports for select to authenticated using((select auth.uid())=user_id);
create policy "Owners submit reports" on public.rider_reports for insert to authenticated with check((select auth.uid())=user_id);

create function archride_private.validate_rider_report() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot record; who uuid:=auth.uid();
begin
 if who is null or not exists(select 1 from auth.users where id=who) then raise exception 'authentication_required'; end if;
 perform pg_advisory_xact_lock(hashtext('archride-report:'||who::text));
 if (select count(*) from public.rider_reports where user_id=who and uploaded_at>now()-interval '1 hour')>=8 then raise exception 'report_rate_limit'; end if;
 if exists(select 1 from public.rider_reports where user_id=who and uploaded_at>now()-interval '15 seconds') then raise exception 'report_rate_limit'; end if;
 new.user_id:=who;new.uploaded_at:=clock_timestamp();new.validation_state:='rejected';new.reason:='source_match_unavailable';
 select * into snapshot from archride_private.arrival_predictions p where p.id=new.arrival_id and p.relationship='SCHEDULED' and p.arrival_at is not null and p.received_at<=new.event_at+interval '2 minutes' and p.update_timestamp<=new.event_at+interval '15 seconds' and p.received_at-p.update_timestamp<=interval '90 seconds' and p.valid_until>p.received_at order by p.update_timestamp desc limit 1;
 if found then
   new.trip_id:=snapshot.trip_id;new.route_id:=snapshot.route_id;new.stop_id:=snapshot.stop_id;new.instance_key:=snapshot.instance_key;new.stop_sequence:=snapshot.stop_sequence;
   if abs(extract(epoch from(new.event_at-snapshot.arrival_at)))<=600 then new.validation_state:='plausible';new.reason:='awaiting_independent_confirmation';else new.reason:='timing_outlier';end if;
 end if;
 return new;
end;
$$;
revoke all on function archride_private.validate_rider_report() from public,anon,authenticated;
create trigger rider_reports_validate before insert on public.rider_reports for each row execute function archride_private.validate_rider_report();

-- Only official stopped-at evidence can promote a report to accepted ground truth.
-- Multiple reports matching one stop occurrence remain one independent event.
create function archride_private.confirm_rider_reports() returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.rider_reports r set validation_state='accepted',reason='official_stop_arrival',matched_observed_at=e.observed_at
 from public.transit_arrival_events e where r.validation_state='plausible' and r.event_kind in ('arrival','boarding') and e.evidence='source_vehicle_stopped_at' and e.instance_key=r.instance_key and e.trip_id=r.trip_id and e.stop_id=r.stop_id and e.stop_sequence=r.stop_sequence and abs(extract(epoch from(e.observed_at-r.event_at)))<=90;
 update public.rider_reports set validation_state='rejected',reason='confirmation_expired' where validation_state='plausible' and uploaded_at<now()-interval '24 hours';
 delete from public.rider_reports where uploaded_at<now()-interval '30 days' or (validation_state='rejected' and uploaded_at<now()-interval '7 days');
end;
$$;
revoke all on function archride_private.confirm_rider_reports() from public,anon,authenticated;
grant execute on function archride_private.confirm_rider_reports() to service_role;

create table archride_private.prediction_models (
 version text primary key check(version ~ '^[a-f0-9]{64}$'),
 dataset_version text not null check(dataset_version ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 model jsonb not null check(jsonb_typeof(model)='object'),
 evaluation jsonb not null check(jsonb_typeof(evaluation)='object'),
 promoted boolean not null default false
);
alter table archride_private.prediction_models enable row level security;
revoke all on archride_private.prediction_models from public,anon,authenticated;
grant all on archride_private.prediction_models to service_role;
create table archride_private.prediction_deployment (
 id boolean primary key default true check(id),
 active_version text references archride_private.prediction_models(version),
 previous_version text references archride_private.prediction_models(version),
 updated_at timestamptz not null default now()
);
insert into archride_private.prediction_deployment(id) values(true);
alter table archride_private.prediction_deployment enable row level security;
revoke all on archride_private.prediction_deployment from public,anon,authenticated;
grant all on archride_private.prediction_deployment to service_role;
-- HOSTED INFRASTRUCTURE:
select cron.schedule('archride-report-validation','23 * * * *','select archride_private.confirm_rider_reports()');
