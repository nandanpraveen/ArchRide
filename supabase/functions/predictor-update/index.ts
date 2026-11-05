import pg from "pg";
import datasetQuery from "./dataset.js";
import {evaluateUpdate} from "./core.js";
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async(request:Request)=>{
 if(request.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
 const token=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
 if(!token)return Response.json({error:"unauthorized"},{status:401});
 const db=new pg.Client({connectionString:Deno.env.get("SUPABASE_DB_URL"),connectionTimeoutMillis:5000,statement_timeout:20000,application_name:"archride-prediction-evaluation"});
 try{
  await db.connect();const hash=await digest(token),auth=await db.query("select token_hash=$1 as allowed from archride_private.transit_job_config where id",[hash]);
  if(!auth.rows[0]?.allowed)return Response.json({error:"unauthorized"},{status:401});
  const locked=await db.query("select pg_try_advisory_lock(hashtext('archride-model-update')) as acquired");if(!locked.rows[0]?.acquired)return Response.json({skipped:"already_running"});
  await db.query("select archride_private.confirm_rider_reports(); select archride_private.confirm_anonymous_reports()");
  const rows=(await db.query(datasetQuery)).rows;
  const current=(await db.query("select m.model from archride_private.prediction_deployment d join archride_private.prediction_models m on m.version=d.active_version where d.id")).rows[0]?.model;
  const result=evaluateUpdate(rows,current),version=await digest(JSON.stringify(result.model)),dataset=await digest(JSON.stringify(rows));
  await db.query("insert into archride_private.prediction_models(version,dataset_version,model,evaluation) values($1,$2,$3::jsonb,$4::jsonb) on conflict(version) do nothing",[version,dataset,JSON.stringify(result.model),JSON.stringify(result.report)]);
  // Segment replay evidence alone does not authorize changing deployed arrival predictions.
  // Official predictions remain active pending end-to-end held-out arrival validation.
  return Response.json({candidateVersion:version,segmentGatePassed:result.report.promote,heldOutEvents:result.report.heldOutEvents,heldOutTrips:result.report.heldOutTrips,serving:"official"});
 }catch{return Response.json({error:"evaluation_unavailable"},{status:503});}finally{await db.end().catch(()=>{});}
});
