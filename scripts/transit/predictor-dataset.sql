-- Each official stop occurrence contributes once, independent of report/revision count.
with events as (
 select instance_key,trip_id,stop_id,stop_sequence,min(observed_at) as observed_at
 from public.transit_arrival_events
 where evidence='source_vehicle_stopped_at' and observed_at>now()-interval '14 days'
 and instance_key is not null and trip_id is not null and stop_sequence is not null
 group by instance_key,trip_id,stop_id,stop_sequence
), ordered as (
 select *,lead(stop_sequence) over w as next_sequence,lead(observed_at) over w as next_at
 from events window w as (partition by instance_key,trip_id order by stop_sequence)
)
select md5(e.instance_key||':'||e.trip_id||':'||e.stop_sequence||':'||e.next_sequence) as "eventId",
 e.instance_key as "instanceKey",e.trip_id as "patternId",coalesce(t.direction_id::text,'unknown') as direction,
 e.stop_sequence as "fromSequence",e.next_sequence as "toSequence",'segment' as kind,
 to_char(e.next_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "observedAt",
 extract(epoch from(e.next_at-e.observed_at))::double precision as seconds,
 case when p.arrival_at>=e.observed_at then extract(epoch from(p.arrival_at-e.observed_at))::double precision else null end as "officialSeconds",
 case when exists(select 1 from public.rider_reports r where r.validation_state='accepted' and r.instance_key=e.instance_key and r.trip_id=e.trip_id and r.stop_sequence=e.stop_sequence) or exists(select 1 from archride_private.anonymous_rider_reports r where r.validation_state='accepted' and r.instance_key=e.instance_key and r.trip_id=e.trip_id and r.stop_sequence=e.stop_sequence) then 'corroborated_rider' else 'official' end as evidence
from ordered e join public.transit_trips t on t.id=e.trip_id
left join lateral (
 select arrival_at from archride_private.arrival_predictions p where p.instance_key=e.instance_key and p.trip_id=e.trip_id and p.stop_sequence=e.next_sequence and p.relationship='SCHEDULED' and p.received_at<=e.observed_at and p.update_timestamp<=e.observed_at and p.update_timestamp>=e.observed_at-interval '90 seconds' and p.valid_until>e.observed_at order by p.update_timestamp desc limit 1
) p on true
where e.next_at>e.observed_at and e.next_at-e.observed_at<=interval '30 minutes'
order by e.next_at desc limit 20000;
