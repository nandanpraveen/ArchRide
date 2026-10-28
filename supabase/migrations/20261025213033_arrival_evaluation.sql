-- Immutable prediction revisions. No rider identity or location is collected.
create schema if not exists archride_private;
create table archride_private.arrival_predictions (
  id text not null,
  update_timestamp timestamptz not null,
  instance_key text not null,
  route_id text not null,
  trip_id text not null,
  stop_id text not null,
  stop_sequence integer not null,
  arrival_at timestamptz,
  received_at timestamptz not null,
  valid_until timestamptz not null,
  relationship text not null,
  captured_at timestamptz not null default now(),
  primary key (id, update_timestamp)
);
alter table archride_private.arrival_predictions enable row level security;
revoke all on archride_private.arrival_predictions from public, anon, authenticated;
grant select, insert, delete on archride_private.arrival_predictions to service_role;
create index arrival_predictions_retention on archride_private.arrival_predictions(captured_at);
-- Runs inside the trusted ingestion transaction, only after an accepted newer revision.
create function archride_private.capture_arrival_prediction() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into archride_private.arrival_predictions
    (id,update_timestamp,instance_key,route_id,trip_id,stop_id,stop_sequence,arrival_at,received_at,valid_until,relationship)
  values (new.id,new.update_timestamp,new.instance_key,new.route_id,new.trip_id,new.stop_id,new.stop_sequence,new.arrival_at,new.received_at,new.valid_until,new.relationship)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function archride_private.capture_arrival_prediction() from public, anon, authenticated;
grant execute on function archride_private.capture_arrival_prediction() to service_role;
create trigger arrival_prediction_capture after insert or update of update_timestamp on public.transit_arrivals
for each row execute function archride_private.capture_arrival_prediction();
-- Deliberately no backfill: predictions captured after an event are not historical evidence.
-- HOSTED INFRASTRUCTURE:
select cron.schedule('archride-arrival-evaluation-retention','17 * * * *',
  $$delete from archride_private.arrival_predictions where captured_at < now()-interval '7 days'$$);
