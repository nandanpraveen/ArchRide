-- Small operations surface. Browsers can only read currently valid manual notices.
create table public.manual_notices (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 1 and 100),
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 route_ids text[] not null default '{}',
 stop_ids text[] not null default '{}',
 valid_from timestamptz not null,
 valid_until timestamptz not null,
 source_url text not null check(source_url ~ '^https://'),
 created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(valid_until>valid_from and valid_until<=valid_from+interval '30 days'),
 check(cardinality(route_ids)<=25 and cardinality(stop_ids)<=50)
);
create index manual_notices_validity on public.manual_notices(valid_until,valid_from);
alter table public.manual_notices enable row level security;
revoke all on public.manual_notices from public,anon,authenticated;
grant select on public.manual_notices to anon,authenticated;
grant all on public.manual_notices to service_role;
create policy "Read current manual notices" on public.manual_notices for select to anon,authenticated using(valid_from<=now() and valid_until>now());

create table archride_private.admin_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 action text not null check(action in ('retry','notice_save','notice_expire','correction_save','correction_remove','cleanup')),
 target_id text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index admin_audit_created on archride_private.admin_audit(created_at desc);
create table archride_private.place_corrections (
 kind text not null check(kind in ('building','entrance')),
 place_id text not null,
 name text not null check(char_length(btrim(name)) between 1 and 200),
 latitude double precision not null check(latitude between 33.88 and 34.02),
 longitude double precision not null check(longitude between -83.46 and -83.29),
 source_url text not null check(source_url ~ '^https://'),
 source_values jsonb not null,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(kind,place_id)
);
alter table archride_private.admin_audit enable row level security;
alter table archride_private.place_corrections enable row level security;
revoke all on archride_private.admin_audit,archride_private.place_corrections from public,anon,authenticated;
grant all on archride_private.admin_audit,archride_private.place_corrections to service_role;

-- Imports keep their source values separately while verified overrides remain applied.
-- This runs with the importer/operator's privileges; browser catalog writes are denied.
create function archride_private.apply_place_correction() returns trigger language plpgsql security invoker set search_path='' as $$
declare correction archride_private.place_corrections; place_kind text;
begin
 place_kind:=case tg_table_name when 'transit_buildings' then 'building' else 'entrance' end;
 select * into correction from archride_private.place_corrections where kind=place_kind and place_id=new.id;
 if found then
  if current_setting('archride.applying_correction',true) is distinct from 'true' then
   update archride_private.place_corrections set source_values=jsonb_build_object('name',new.name,'latitude',new.latitude,'longitude',new.longitude,'provenance',new.provenance) where kind=place_kind and place_id=new.id;
  end if;
  new.name:=correction.name;new.latitude:=correction.latitude;new.longitude:=correction.longitude;
  new.provenance:='Verified maintainer correction: '||correction.source_url;
 end if;
 return new;
end;
$$;
revoke all on function archride_private.apply_place_correction() from public,anon,authenticated;
grant execute on function archride_private.apply_place_correction() to service_role;
create trigger building_correction before insert or update on public.transit_buildings for each row execute function archride_private.apply_place_correction();
create trigger entrance_correction before insert or update on public.transit_entrances for each row execute function archride_private.apply_place_correction();

-- Selected-plan metadata is retained for trip identity/revalidation, never as a live ETA.
alter table public.active_trips
 add column trip_id text check(char_length(trip_id)<=200),
 add column alighting_sequence integer check(alighting_sequence>=0),
 add column selected_boarding_at timestamptz,
 add column selected_destination_arrival_at timestamptz,
 add column walk_to_seconds integer check(walk_to_seconds between 0 and 7200),
 add column walk_from_seconds integer check(walk_from_seconds between 0 and 7200);

-- HOSTED INFRASTRUCTURE:
-- Evaluation reads already authorized cached observations; it makes no upstream transit requests.
create function archride_private.dispatch_predictor_update() returns bigint language plpgsql security invoker set search_path='' as $$
declare project text; token text; request_id bigint;
begin
 select project_url into project from archride_private.transit_job_config where id;
 if project is null then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='archride_transit_job_token';
 select net.http_post(url=>project||'/functions/v1/predictor-update',headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body=>'{}'::jsonb,timeout_milliseconds=>120000) into request_id;
 return request_id;
end;
$$;
revoke all on function archride_private.dispatch_predictor_update() from public,anon,authenticated;
grant execute on function archride_private.dispatch_predictor_update() to service_role;
select cron.schedule('archride-predictor-evaluation','37 * * * *','select archride_private.dispatch_predictor_update()');
create function archride_private.cleanup_operations() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from archride_private.admin_audit where created_at<now()-interval '90 days';
 delete from public.manual_notices where valid_until<now()-interval '30 days';
end;
$$;
revoke all on function archride_private.cleanup_operations() from public,anon,authenticated;
grant execute on function archride_private.cleanup_operations() to service_role;
select cron.schedule('archride-operations-retention','53 * * * *','select archride_private.cleanup_operations()');
