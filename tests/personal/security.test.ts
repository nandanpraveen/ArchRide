import assert from "node:assert/strict";
import test from "node:test";
import {localDatabase} from "../../scripts/transit/local-db";
const a="10000000-0000-0000-0000-000000000001",b="10000000-0000-0000-0000-000000000002",place=JSON.stringify({id:"building:1",name:"Science",type:"building"});
test("personal tables enforce owner isolation, immutable ownership, atomic reordering and deletion cascades",async()=>{
 const {engine}=await localDatabase();try{
  await engine.exec(`insert into auth.users(id) values('${a}'),('${b}');set role authenticated;set request.jwt.claim.sub='${a}';`);
  await engine.query(`insert into public.profiles(id) values($1)`,[a]);
  const one=await engine.query<{id:string}>(`insert into public.saved_items(item_key,kind,name,destination,position) values('one','stop','One',$1::jsonb,0) returning id`,[JSON.stringify({id:"stop:1",name:"One",type:"stop"})]);
  const two=await engine.query<{id:string}>(`insert into public.saved_items(item_key,kind,name,destination,position) values('two','stop','Two',$1::jsonb,1) returning id`,[JSON.stringify({id:"stop:2",name:"Two",type:"stop"})]);
  await engine.query(`select public.move_saved_item($1,-1)`,[two.rows[0].id]);
  assert.deepEqual((await engine.query<{name:string}>("select name from public.saved_items order by position")).rows.map(r=>r.name),["Two","One"]);
  await assert.rejects(engine.query(`update public.saved_items set user_id=$1`,[b]),{code:"42501"});
  await assert.rejects(engine.query(`update public.profiles set walking_speed=9`),{code:"23514"});
  await assert.rejects(engine.query(`update public.profiles set default_origin=$1::jsonb`,[JSON.stringify({id:"gps",name:"GPS",type:"stop",latitude:33.95,longitude:-83.37})]),{code:"23514"});
  await engine.query(`insert into public.active_trips(destination,mode) values($1::jsonb,'walk')`,[place]);
  await engine.exec(`set request.jwt.claim.sub='${b}'`);
  for(const table of ["profiles","saved_items","active_trips","rider_reports"]){assert.equal((await engine.query(`select * from public.${table}`)).rows.length,0);}
  assert.equal((await engine.query(`delete from public.saved_items where id=$1 returning id`,[one.rows[0].id])).rows.length,0);
  await engine.exec("reset role;set role anon");
  for(const table of ["profiles","saved_items","active_trips","rider_reports"]){await assert.rejects(engine.query(`select * from public.${table}`),{code:"42501"});}
  await engine.exec(`reset role;delete from auth.users where id='${a}';set role authenticated;set request.jwt.claim.sub='${a}';`);
  for(const table of ["profiles","saved_items","active_trips"]){assert.equal((await engine.query(`select * from public.${table}`)).rows.length,0);}
  await assert.rejects(engine.query(`insert into public.profiles(id) values($1)`,[a]),{code:"23503"});
  await assert.rejects(engine.query(`insert into public.active_trips(destination,mode) values($1::jsonb,'walk')`,[place]),{code:"23503"});
  await engine.exec("reset role");assert.equal((await engine.query(`select id from auth.users where id=$1`,[b])).rows.length,1);
 }finally{await engine.close();}
});
test("reports validate source occurrence, deduplicate, rate-limit and protect validation fields",async()=>{
 const {engine}=await localDatabase();try{
  await engine.exec(`insert into auth.users(id) values('${a}'),('${b}');insert into archride_private.arrival_predictions(id,update_timestamp,instance_key,route_id,trip_id,stop_id,stop_sequence,arrival_at,received_at,valid_until,relationship) values('test-arrival',now(),'instance','route','trip','stop',2,now(),now(),now()+interval '90 seconds','SCHEDULED');set role authenticated;set request.jwt.claim.sub='${a}';`);
  const r=await engine.query<{validation_state:string;stop_sequence:number}>(`insert into public.rider_reports(arrival_id,event_kind,event_at) values('test-arrival','arrival',now()) returning validation_state,stop_sequence`);assert.equal(r.rows[0].validation_state,"plausible");assert.equal(r.rows[0].stop_sequence,2);
  await assert.rejects(engine.query(`insert into public.rider_reports(arrival_id,event_kind,event_at) values('test-arrival','boarding',now())`),/report_rate_limit/);
  await assert.rejects(engine.query(`update public.rider_reports set validation_state='accepted'`),{code:"42501"});
  await assert.rejects(engine.query(`insert into public.rider_reports(arrival_id,event_kind,event_at,validation_state) values('test-arrival','boarding',now(),'accepted')`),{code:"42501"});
  await engine.exec(`set request.jwt.claim.sub='${b}'`);assert.equal((await engine.query("select * from public.rider_reports")).rows.length,0);
  const bad=await engine.query<{validation_state:string}>(`insert into public.rider_reports(arrival_id,event_kind,event_at) values('foreign-arrival','arrival',now()) returning validation_state`);assert.equal(bad.rows[0].validation_state,"rejected");
 }finally{await engine.close();}
});
