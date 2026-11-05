import assert from "node:assert/strict";
import test from "node:test";
import { localDatabase } from "../../scripts/transit/local-db";
import { publicQuery } from "../../supabase/functions/public-read/validation";
import { networkPrefix } from "../../supabase/functions/_shared/network";
test("public queries accept only bounded scalar catalog reads and suppress private embeddings", () => {
  assert(publicQuery("/rest/v1/transit_routes?select=*&active=eq.true&limit=1000"));
  assert(publicQuery("/rest/v1/transit_trips?select=id,headsign&id=in.(one,two)&order=id.asc&offset=1000"));
  for (const path of ["https://evil.test/rest/v1/transit_routes", "/rest/v1/profiles?select=*", "/rest/v1/manual_notices?select=created_by", "/rest/v1/transit_routes?select=*,profiles(*)", "/rest/v1/transit_routes?select=total:count()", "/rest/v1/transit_routes?limit=1001", "/rest/v1/transit_routes?offset=10001", "/rest/v1/transit_routes?or=(active.eq.true)", "/rest/v1/transit_routes?private=eq.true", "/rest/v1/transit_routes?name=match..*"]) assert.equal(publicQuery(path), null, path);
  const notice = publicQuery("/rest/v1/manual_notices?select=*", "2026-11-03T10:00:00Z")!;
  assert(!notice.path.includes("created_by")); assert(notice.path.includes("valid_until=gt."));
  assert.equal(networkPrefix("192.0.2.1"), "192.0.2.1");
  assert.equal(networkPrefix("2001:db8:1234:5678::1"), networkPrefix("2001:db8:1234:5678::abcd"));
  assert.equal(networkPrefix("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(networkPrefix("192.0.2.1, 198.51.100.1"), null);
  assert.equal(networkPrefix(null), null);
});
test("anonymous admission is atomic, bounded, short lived and inaccessible to browser roles", async () => {
  const { engine } = await localDatabase(); const hash = "a".repeat(64);
  try {
    await engine.exec("set role anon");
    await assert.rejects(engine.query("select * from archride_private.request_limits"), { code: "42501" });
    await assert.rejects(engine.query("select * from public.transit_routes"), { code: "42501" });
    await engine.exec("reset role");
    const first = (await engine.query<{ allowed: boolean; lease_id: string }>("select * from archride_private.admit_public_request('walking',$1)", [hash])).rows[0]; assert(first.allowed);
    const second = (await engine.query<{ allowed: boolean }>("select * from archride_private.admit_public_request('walking',$1)", [hash])).rows[0]; assert(second.allowed);
    const third = (await engine.query<{ allowed: boolean; retry_after: number }>("select * from archride_private.admit_public_request('walking',$1)", [hash])).rows[0]; assert.equal(third.allowed, false); assert.equal(third.retry_after, 1);
    await engine.exec("delete from archride_private.request_leases");
    await engine.query("update archride_private.request_limits set hits=179 where scope='walking' and key_hash=$1", [hash]);
    const results = await Promise.all(Array.from({ length: 8 }, () => engine.query<{ allowed: boolean; retry_after: number }>("select * from archride_private.admit_public_request('walking',$1)", [hash])));
    assert.equal(results.filter(r => r.rows[0].allowed).length, 1);
    assert(results.filter(r => !r.rows[0].allowed).every(r => r.rows[0].retry_after >= 1 && r.rows[0].retry_after <= 60));
    await engine.query("update archride_private.request_limits set window_start=window_start-interval '1 minute' where scope='walking' and key_hash=$1", [hash]);
    await engine.exec("delete from archride_private.request_leases");
    assert((await engine.query<{ allowed: boolean }>("select * from archride_private.admit_public_request('walking',$1)", [hash])).rows[0].allowed);
  } finally { await engine.close(); }
});
test("anonymous reports deduplicate occurrences and require independent official confirmation", async () => {
  const { engine } = await localDatabase();
  try {
    await engine.exec("insert into archride_private.arrival_predictions(id,update_timestamp,instance_key,route_id,trip_id,stop_id,stop_sequence,arrival_at,received_at,valid_until,relationship) values('source-event',now(),'trip-instance','route','trip','stop',2,now(),now(),now()+interval '90 seconds','SCHEDULED')");
    const first = (await engine.query<{ validation_state: string; duplicate: boolean }>("select * from archride_private.submit_anonymous_report('source-event','arrival',now())")).rows[0]; assert.equal(first.validation_state, "plausible"); assert.equal(first.duplicate, false);
    const duplicate = (await engine.query<{ duplicate: boolean }>("select * from archride_private.submit_anonymous_report('source-event','arrival',now())")).rows[0]; assert.equal(duplicate.duplicate, true);
    const invalid = (await engine.query<{ validation_state: string }>("select * from archride_private.submit_anonymous_report('unknown-event','arrival',now())")).rows[0]; assert.equal(invalid.validation_state, "rejected");
    await engine.query("select archride_private.confirm_anonymous_reports()");
    assert.equal((await engine.query<{ count: number }>("select count(*)::int as count from archride_private.anonymous_rider_reports where validation_state='accepted'")).rows[0].count, 0);
    assert.equal((await engine.query("select column_name from information_schema.columns where table_schema='archride_private' and table_name='anonymous_rider_reports' and column_name in ('user_id','network_hash','latitude','longitude','device_id')")).rows.length, 0);
    await engine.exec("set role anon"); await assert.rejects(engine.query("select * from archride_private.anonymous_rider_reports"), { code: "42501" });
  } finally { await engine.close(); }
});

test("history caps preserve latest state and trim only excess diagnostic history", async()=>{
 const {engine}=await localDatabase();
 try{
  await engine.exec("update public.transit_retention set job_max_rows=1000; insert into public.transit_job_runs(feed_id,finished_at,outcome,entity_count) select 'budget-test',now()-make_interval(secs=>s),'success',s from generate_series(1,1005) s");
  await engine.query("select archride_private.enforce_history_budget()");
  const rows=(await engine.query<{count:number;max:number;min:number}>("select count(*)::int as count,max(entity_count)::int as max,min(entity_count)::int as min from public.transit_job_runs where feed_id='budget-test'")).rows[0];
  assert.equal(rows.count,1000);assert.equal(rows.max,1000);assert.equal(rows.min,1);
  assert((await engine.query("select * from public.feed_status")).rows.length>0);
 }finally{await engine.close();}
});
