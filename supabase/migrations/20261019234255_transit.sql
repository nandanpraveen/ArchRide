-- Task 2 owns public transit. Task 3 owns personal tables; no changes to profiles.
create table public.transit_sources (
 id text primary key, name text not null, timezone text not null,
 attribution text not null, static_url text not null, enabled boolean not null default false
);
insert into public.transit_sources values ('uga-passio','UGA / Passio','America/New_York','Transit data provided by UGA and Passio','https://passio3.com/uga/passioTransit/gtfs/google_transit.zip',false);

alter table public.feed_status add column source_timestamp timestamptz;
alter table public.feed_status add column entity_count integer not null default 0;
alter table public.feed_status add column error_code text;
alter table public.feed_status add column next_attempt_at timestamptz;

create table public.transit_routes (
 id text primary key, source_id text not null references public.transit_sources(id),
 source_id_raw text not null, short_name text not null, long_name text not null,
 color text, text_color text, active boolean not null default true,
 unique(source_id, source_id_raw)
);
create table public.transit_stops (
 id text primary key, source_id text not null references public.transit_sources(id),
 source_id_raw text not null, name text not null,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 location_type integer not null default 0, parent_station text,
 active boolean not null default true, unique(source_id,source_id_raw)
);
create table public.transit_shapes (
 id text primary key, source_id text not null references public.transit_sources(id),
 source_id_raw text not null, points jsonb not null check(jsonb_typeof(points)='array')
);
create table public.transit_services (
 id text primary key, source_id text not null references public.transit_sources(id),
 source_id_raw text not null, calendar jsonb, exceptions jsonb not null default '[]'
);
create table public.transit_trips (
 id text primary key, source_id text not null references public.transit_sources(id), source_id_raw text not null,
 route_id text not null references public.transit_routes(id), service_id text not null references public.transit_services(id),
 shape_id text references public.transit_shapes(id), direction_id integer, headsign text,
 active boolean not null default true, unique(source_id,source_id_raw)
);
-- Trip + sequence is occurrence identity, NOT trip + physical stop.
create table public.transit_stop_times (
 id text primary key, trip_id text not null references public.transit_trips(id),
 stop_id text not null references public.transit_stops(id), stop_sequence integer not null check(stop_sequence >= 0),
 arrival_seconds integer check(arrival_seconds >= 0), departure_seconds integer check(departure_seconds >= 0),
 pickup_type integer, drop_off_type integer, unique(trip_id,stop_sequence)
);
create index transit_stop_times_stop on public.transit_stop_times(stop_id);
create index transit_trips_route on public.transit_trips(route_id);
create index transit_trips_service on public.transit_trips(service_id);
create index transit_trips_shape on public.transit_trips(shape_id);
create table public.transit_frequencies (
 id text primary key, trip_id text not null references public.transit_trips(id),
 start_seconds integer not null, end_seconds integer not null, headway_seconds integer not null check(headway_seconds>0),
 exact_times boolean not null, check(end_seconds>start_seconds)
);
create index transit_frequencies_trip on public.transit_frequencies(trip_id);
-- Buildings need a separately verified campus source; stops are not building entrances.
create table public.transit_buildings (
 id text primary key, name text not null, aliases text[] not null default '{}',
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 provenance text not null, verified_at timestamptz not null
);
create table public.transit_entrances (
 id text primary key, building_id text not null references public.transit_buildings(id) on delete cascade,
 name text not null, latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180), accessible boolean, provenance text not null
);
create index transit_entrances_building on public.transit_entrances(building_id);
create table public.transit_vehicles (
 id text primary key, source_id text not null references public.transit_sources(id), source_id_raw text not null,
 route_id text references public.transit_routes(id), trip_id text references public.transit_trips(id),
 instance_key text, stop_id text references public.transit_stops(id), stop_sequence integer,
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 bearing double precision check(bearing between 0 and 360), speed double precision check(speed>=0),
 source_timestamp timestamptz not null, received_at timestamptz not null,
 position_timestamp timestamptz not null, position_timestamp_kind text not null check(position_timestamp_kind in ('vehicle','feed')),
 current_status text not null
);
create index transit_vehicles_route on public.transit_vehicles(route_id);
create index transit_vehicles_trip on public.transit_vehicles(trip_id);
create index transit_vehicles_stop on public.transit_vehicles(stop_id);
create table public.transit_observations (like public.transit_vehicles including defaults including constraints);
alter table public.transit_observations add primary key(id,position_timestamp);
create index transit_observations_retention on public.transit_observations(received_at);
create table public.transit_arrivals (
 id text primary key, source_id text not null references public.transit_sources(id),
 trip_id text not null references public.transit_trips(id), instance_key text not null,
 route_id text not null references public.transit_routes(id), stop_id text not null references public.transit_stops(id), stop_sequence integer not null,
 arrival_at timestamptz, departure_at timestamptz, uncertainty_seconds integer,
 relationship text not null, source_timestamp timestamptz not null, received_at timestamptz not null,
 update_timestamp timestamptz not null, timestamp_kind text not null check(timestamp_kind in ('trip','feed')),
 provenance text not null default 'source', valid_until timestamptz not null
);
create index transit_arrivals_stop_time on public.transit_arrivals(stop_id,arrival_at);
create index transit_arrivals_trip on public.transit_arrivals(trip_id);
create index transit_arrivals_route on public.transit_arrivals(route_id);
create index transit_arrivals_retention on public.transit_arrivals(valid_until);
create table public.transit_arrival_events (
 id text primary key, vehicle_id text not null, trip_id text references public.transit_trips(id),
 instance_key text, stop_id text not null references public.transit_stops(id), stop_sequence integer,
 observed_at timestamptz not null, received_at timestamptz not null, evidence text not null check(evidence='source_vehicle_stopped_at')
);
create index transit_arrival_events_retention on public.transit_arrival_events(received_at);
create index transit_arrival_events_trip on public.transit_arrival_events(trip_id);
create index transit_arrival_events_stop on public.transit_arrival_events(stop_id);
create table public.transit_alerts (
 id text primary key, source_id text not null references public.transit_sources(id), source_id_raw text not null,
 header text not null, description text not null, url text, cause text, effect text,
 active_periods jsonb not null, informed_entities jsonb not null,
 source_timestamp timestamptz not null, received_at timestamptz not null, active boolean not null default true,
 provenance text not null default 'source'
);
create table public.transit_alert_entities (
 id text primary key, alert_id text not null references public.transit_alerts(id) on delete cascade,
 route_id text references public.transit_routes(id), stop_id text references public.transit_stops(id),
 trip_id text references public.transit_trips(id), selector jsonb not null
);
create index transit_alert_entities_alert on public.transit_alert_entities(alert_id);
create index transit_alert_entities_route on public.transit_alert_entities(route_id);
create index transit_alert_entities_stop on public.transit_alert_entities(stop_id);
create index transit_alert_entities_trip on public.transit_alert_entities(trip_id);
-- Only verified public boarding/building points belong here. Never cache user GPS coordinates.
create table public.transit_walking_cache (
 id text primary key, origin_id text not null, destination_id text not null,
 provider text not null, profile text not null, duration_seconds integer not null check(duration_seconds>=0),
 distance_meters double precision not null check(distance_meters>=0), geometry jsonb not null,
 fetched_at timestamptz not null, expires_at timestamptz not null
);
create index transit_walking_cache_retention on public.transit_walking_cache(expires_at);
create table public.transit_job_runs (
 id uuid primary key default gen_random_uuid(), feed_id text not null, started_at timestamptz not null default now(),
 finished_at timestamptz not null default now(), outcome text not null, entity_count integer not null default 0,
 error_code text -- bounded code only; no response bodies, URLs with credentials, or stack traces
);
create index transit_job_runs_retention on public.transit_job_runs(finished_at);
create table public.transit_retention (
 id boolean primary key default true check(id), observation_hours integer not null default 24 check(observation_hours between 1 and 168),
 event_days integer not null default 14 check(event_days between 1 and 90),
 job_days integer not null default 7 check(job_days between 1 and 30)
);
insert into public.transit_retention(id) values(true);
-- Explicit grants and policies, including non-public history/diagnostics/configuration.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'transit\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t not in ('transit_observations','transit_arrival_events','transit_job_runs','transit_retention') then
   execute format('grant select on public.%I to anon, authenticated',t);
   execute format('create policy "Public transit read" on public.%I for select to anon, authenticated using (true)',t);
  end if;
 end loop;
end $$;
insert into public.feed_status(id) values ('uga-passio:static'),('uga-passio:vehicles'),('uga-passio:arrivals'),('uga-passio:alerts');
