-- Trusted operator query; returns aggregates only. No rider data, tokens or raw history.
with eligible as (
 select p.*, case
   when relationship <> 'SCHEDULED' or arrival_at is null then 'missing'
   when valid_until <= received_at or received_at-update_timestamp > interval '180 seconds'
     or update_timestamp-received_at > interval '120 seconds' then 'stale'
   else 'eligible' end as state
 from archride_private.arrival_predictions p
), matched as (
 select p.*, o.events,o.observation_id,o.observed_at,
   extract(epoch from (o.observed_at-p.arrival_at)) as error_seconds
 from eligible p left join lateral (
   select count(*) as events,min(e.id) as observation_id,min(e.observed_at) as observed_at
   from public.transit_arrival_events e
   where e.evidence='source_vehicle_stopped_at' and e.instance_key=p.instance_key
     and e.trip_id=p.trip_id and e.stop_id=p.stop_id and e.stop_sequence=p.stop_sequence
     and e.observed_at >= greatest(p.received_at,p.update_timestamp) and e.observed_at <= now()
 ) o on true
), cadence as (
 select extract(epoch from finished_at-lag(finished_at) over(order by finished_at)) as seconds
 from public.transit_job_runs where feed_id='uga-passio:arrivals' and finished_at>=now()-interval '1 day'
), route_metrics as (
 select route_id,count(*) as predictions,count(distinct observation_id) as independent_events,
 avg(error_seconds) as bias_seconds,percentile_cont(.5) within group(order by error_seconds) as median_seconds
 from matched where state='eligible' and events=1 group by route_id having count(distinct observation_id)>=30
), time_metrics as (
 select extract(hour from observed_at at time zone 'America/New_York') as campus_hour,
 count(*) as predictions,count(distinct observation_id) as independent_events,avg(error_seconds) as bias_seconds
 from matched where state='eligible' and events=1 group by 1 having count(distinct observation_id)>=30
)
select json_build_object(
 'generatedAt',now(), 'retentionDays',7,
 'collectionStarted',(select min(captured_at) from matched),
 'latestCapture',(select max(captured_at) from matched),
 'counts',(select json_build_object('predictions',count(*),
   'matched',count(*) filter(where state='eligible' and events=1),
   'independentEvents',count(distinct observation_id) filter(where state='eligible' and events=1),
   'stale',count(*) filter(where state='stale'),'missing',count(*) filter(where state='missing'),
   'pending',count(*) filter(where state='eligible' and events<>1 and arrival_at+interval '1 hour'>now()),
   'unmatched',count(*) filter(where state='eligible' and events<>1 and arrival_at+interval '1 hour'<=now()),
   'ambiguous',count(*) filter(where state='eligible' and events>1)) from matched),
 'errorSeconds',(select json_build_object('p10',percentile_cont(.1) within group(order by error_seconds),
   'median',percentile_cont(.5) within group(order by error_seconds),'p90',percentile_cont(.9) within group(order by error_seconds),
   'bias',avg(error_seconds),'meanAbsolute',avg(abs(error_seconds))) from matched where state='eligible' and events=1),
 'staleOrMissingRate',(select count(*) filter(where state in ('stale','missing'))::numeric/nullif(count(*),0) from matched),
 'observationCoverage',(select count(*) filter(where state='eligible' and events=1)::numeric/nullif(count(*),0) from matched),
 'sourceAttempts',(select json_agg(j) from (select feed_id,outcome,count(*) as attempts from public.transit_job_runs where finished_at>=now()-interval '7 days' group by feed_id,outcome order by feed_id,outcome) j),
 'cadenceSeconds',(select json_build_object('median',percentile_cont(.5) within group(order by seconds),'p90',percentile_cont(.9) within group(order by seconds)) from cadence where seconds>0),
 'routes',(select coalesce(json_agg(r),'[]'::json) from route_metrics r),
 'campusHours',(select coalesce(json_agg(t),'[]'::json) from time_metrics t),
 'calibrationEnabled',false
) as report;
