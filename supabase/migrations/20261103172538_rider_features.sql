-- Personal data stays owner-scoped; public transit remains read-only to browsers.
create function public.valid_place_ref(v jsonb) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(v) = 'object' and v ?& array['id','type','name'] and jsonb_typeof(v->'id')='string' and jsonb_typeof(v->'name')='string' and (v - array['id','type','name']) = '{}'::jsonb and v->>'type' in ('building','entrance','stop') and char_length(v->>'id') between 1 and 200 and char_length(v->>'name') between 1 and 200, false)
$$;
revoke all on function public.valid_place_ref(jsonb) from public, anon;
grant execute on function public.valid_place_ref(jsonb) to authenticated, service_role;
alter table public.profiles
  add column walking_speed numeric not null default 1.34 check (walking_speed between 0.7 and 2.2),
  add column arrival_buffer smallint not null default 3 check (arrival_buffer between 0 and 30),
  add column theme text not null default 'system' check (theme in ('system','light','dark')),
  add column default_origin jsonb check (default_origin is null or public.valid_place_ref(default_origin)),
  add column quiet_start text check (quiet_start is null or quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column quiet_end text check (quiet_end is null or quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.profiles add constraint quiet_hours_pair check ((quiet_start is null) = (quiet_end is null));

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 450),
  kind text not null check (kind in ('stop','journey')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  origin jsonb,
  destination jsonb not null,
  position integer not null default 0 check (position between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key),
  check (public.valid_place_ref(destination)),
  check ((kind = 'stop' and origin is null and destination->>'type' = 'stop') or (kind = 'journey' and origin is not null and public.valid_place_ref(origin)))
);
create index saved_items_owner_order on public.saved_items(user_id, position, created_at);
create trigger saved_items_updated before update on public.saved_items for each row execute function public.classes_set_updated_at();
create index transit_walking_cache_points on public.transit_walking_cache(origin_id,destination_id,profile,fetched_at desc);
create trigger profiles_updated before update on public.profiles for each row execute function public.classes_set_updated_at();

create table public.active_trips (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  origin jsonb,
  destination jsonb not null,
  mode text not null check (mode in ('walk','bus')),
  step smallint not null default 0 check (step between 0 and 5),
  instance_key text check (char_length(instance_key) <= 300),
  boarding_sequence integer check (boarding_sequence >= 0),
  boarding jsonb check (boarding is null or public.valid_place_ref(boarding)),
  alighting jsonb check (alighting is null or public.valid_place_ref(alighting)),
  route_name text not null default '' check (char_length(route_name) <= 200),
  headsign text not null default '' check (char_length(headsign) <= 200),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours',
  check (expires_at > created_at and expires_at <= created_at + interval '6 hours'),
  check (public.valid_place_ref(destination)),
  check (origin is null or public.valid_place_ref(origin))
);

alter table public.saved_items enable row level security;
alter table public.active_trips enable row level security;
revoke all on public.saved_items, public.active_trips from anon, authenticated;
grant select, insert, update, delete on public.saved_items, public.active_trips to authenticated;
grant all on public.saved_items, public.active_trips to service_role;
create policy "Owners read saved items" on public.saved_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create saved items" on public.saved_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update saved items" on public.saved_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete saved items" on public.saved_items for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Owners read active trips" on public.active_trips for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create active trips" on public.active_trips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update active trips" on public.active_trips for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete active trips" on public.active_trips for delete to authenticated using ((select auth.uid()) = user_id);

-- Duplicate weekdays are invalid at the database boundary too.
create function public.move_saved_item(item_id uuid, delta integer) returns void language plpgsql security invoker set search_path = '' as $$
declare ids uuid[]; source integer; target integer; swap uuid; who uuid := auth.uid();
begin
  if who is null or delta not in (-1,1) then raise exception 'invalid_move'; end if;
  perform id from public.saved_items where user_id = who order by id for update;
  select array_agg(id order by position,created_at,id) into ids from public.saved_items where user_id = who;
  source := array_position(ids,item_id); target := source + delta;
  if source is null or target < 1 or target > cardinality(ids) then return; end if;
  swap := ids[target]; ids[target] := ids[source]; ids[source] := swap;
  update public.saved_items s set position = v.position from unnest(ids) with ordinality v(id,position) where s.id = v.id and s.user_id = who;
end;
$$;
revoke all on function public.move_saved_item(uuid,integer) from public, anon;
grant execute on function public.move_saved_item(uuid,integer) to authenticated,service_role;

create function public.distinct_weekdays(days smallint[]) returns boolean language sql immutable set search_path = '' as $$ select cardinality(days) = (select count(distinct d) from unnest(days) d) $$;
alter table public.classes add constraint classes_unique_weekdays check (public.distinct_weekdays(weekdays));
revoke execute on function public.classes_set_updated_at() from public, anon, authenticated;
revoke execute on function public.distinct_weekdays(smallint[]) from public, anon;
grant execute on function public.distinct_weekdays(smallint[]) to authenticated, service_role;

-- HOSTED INFRASTRUCTURE:
create table archride_private.walking_limiter (id boolean primary key default true check(id), requested_at timestamptz not null default '-infinity');
insert into archride_private.walking_limiter(id) values(true);
alter table archride_private.walking_limiter enable row level security;
revoke all on archride_private.walking_limiter from public, anon, authenticated;
grant all on archride_private.walking_limiter to service_role;
-- Existing retention job also removes expired notifications and active sessions.
create or replace function archride_private.cleanup_rider_data() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications where expires_at < now() - interval '7 days';
  delete from public.active_trips where expires_at < now();
end;
$$;
revoke all on function archride_private.cleanup_rider_data() from public, anon, authenticated;
grant execute on function archride_private.cleanup_rider_data() to service_role;
select cron.schedule('archride-rider-retention', '17 * * * *', 'select archride_private.cleanup_rider_data()');
