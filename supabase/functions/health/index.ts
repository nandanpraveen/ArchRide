import { admit, databaseClient } from "../_shared/admission.ts";
import { cors, guard } from "../_shared/http.ts";
import { feedFreshness } from "../../../src/lib/transit/contracts.ts";
Deno.serve(async (request: Request) => {
  const headers = cors(request);
  const early = guard(request, ["GET"]); if (early) return early;
  const db = databaseClient("archride-public-health"); let release = async()=>{};
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (request.method !== "GET") return Response.json({error: "method_not_allowed"}, {status:405, headers});
  try {
    const admission=await admit(request,"read",db); release=admission.release; if(admission.response)return admission.response;
    const result=await db.query("select * from public.feed_status where id=any($1::text[])",[["uga-passio:static","uga-passio:vehicles","uga-passio:arrivals","uga-passio:alerts"]]);
    const feeds = result.rows.map(f => ({id:f.id, freshness:feedFreshness(f), sourceTimestamp:f.source_timestamp, lastSuccessAt:f.last_success_at, entityCount:f.entity_count}));
    return Response.json({app:"ArchRide", status:"ok", database:"connected", transit:feeds.length===4 && feeds.every(f=>f.freshness==="current") ? "connected":"degraded", feeds}, {headers});
  } catch {return Response.json({app:"ArchRide", status:"degraded", database:"unavailable"}, {status:503, headers});}
  finally{await release();await db.end().catch(()=>{});}
});
