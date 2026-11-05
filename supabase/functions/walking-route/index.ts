import { admit, databaseClient } from "../_shared/admission.ts";
import { cors, guard } from "../_shared/http.ts";
type Point={id:string;latitude:number;longitude:number};
const campus=(p:Point)=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=33.88&&p.latitude<=34.02&&p.longitude>=-83.46&&p.longitude<=-83.29;
Deno.serve(async(request:Request)=>{
  const early=guard(request);if(early)return early;
  const headers=cors(request),db=databaseClient("archride-walking");
  let release=async()=>{};
  try{
    const raw=await request.text();if(raw.length>4096)return Response.json({error:"request_too_large"},{status:413,headers});
    let body;try{body=JSON.parse(raw);}catch{return Response.json({error:"invalid_request"},{status:400,headers});}
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["from","to"].includes(k)))return Response.json({error:"invalid_request"},{status:400,headers});
    const admission=await admit(request,"walking",db);release=admission.release;if(admission.response)return admission.response;
    async function resolve(ref:unknown,allowGps:boolean):Promise<Point>{
      if(!ref||typeof ref!=="object")throw new Error("invalid_place");
      const r=ref as Record<string,unknown>;
      if(allowGps&&r.type==="gps"){const p={id:"current-location",latitude:Number(r.latitude),longitude:Number(r.longitude)};if(campus(p))return p;throw new Error("outside_campus");}
      const table=r.type==="building"?"transit_buildings":r.type==="entrance"?"transit_entrances":r.type==="stop"?"transit_stops":null;
      if(!table||typeof r.id!=="string"||r.id.length>200)throw new Error("invalid_place");
      const result=await db.query(`select id,latitude,longitude from public.${table} where id=$1${table==="transit_stops"?" and active":""}`,[r.id]);
      if(!result.rows[0]||!campus(result.rows[0]))throw new Error("invalid_place");return result.rows[0];
    }
    const from=await resolve(body.from,true),to=await resolve(body.to,false),cacheable=from.id!=="current-location";
    if(cacheable){const cached=await db.query("select * from public.transit_walking_cache where origin_id=$1 and destination_id=$2 and profile='foot' and expires_at>now() order by fetched_at desc limit 1",[from.id,to.id]);if(cached.rows[0]){const r=cached.rows[0];return Response.json({originId:r.origin_id,destinationId:r.destination_id,seconds:r.duration_seconds,meters:r.distance_meters,coordinates:r.geometry,provider:r.provider,fetchedAt:r.fetched_at,expiresAt:r.expires_at},{headers});}}
    const lock=await db.query("select pg_try_advisory_lock(hashtext('archride-walking-provider')) as acquired");
    if(!lock.rows[0]?.acquired)return Response.json({error:"routing_busy"},{status:429,headers:{...headers,"retry-after":"1"}});
    const rate=await db.query("update archride_private.walking_limiter set requested_at=clock_timestamp() where id and requested_at<=clock_timestamp()-interval '1 second' returning id");
    if(!rate.rowCount)return Response.json({error:"routing_busy"},{status:429,headers:{...headers,"retry-after":"1"}});
    const coordinates=`${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?overview=full&geometries=geojson&steps=false`,{headers:{"User-Agent":"ArchRide/1.0 (+https://nandanpraveen.github.io/archride/)"},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("routing_unavailable");
    const result=await response.json(),route=result.routes?.[0],geometry=route?.geometry?.coordinates;
    if(result.code!=="Ok"||!route||!Number.isFinite(route.duration)||route.duration<0||route.duration>14400||!Number.isFinite(route.distance)||route.distance>15000||!Array.isArray(geometry)||!geometry.length||!geometry.every((p:unknown)=>Array.isArray(p)&&p.length===2&&campus({id:"",longitude:p[0],latitude:p[1]}))||result.waypoints?.some((w:{distance:number})=>!Number.isFinite(w.distance)||w.distance>100))throw new Error("walking_path_unavailable");
    const fetchedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+(cacheable?86400000:600000)).toISOString();
    const path={originId:from.id,destinationId:to.id,seconds:Math.ceil(route.duration),meters:route.distance,coordinates:geometry,provider:"FOSSGIS / OpenStreetMap",fetchedAt,expiresAt};
    // GPS origins never enter the database, even as a cache key or path endpoint.
    if(cacheable)await db.query("insert into public.transit_walking_cache(id,origin_id,destination_id,provider,profile,duration_seconds,distance_meters,geometry,fetched_at,expires_at) select $1,$2,$3,$4,'foot',$5,$6,$7::jsonb,$8,$9 where pg_column_size($7::jsonb)<=16384 on conflict(id) do update set duration_seconds=excluded.duration_seconds,distance_meters=excluded.distance_meters,geometry=excluded.geometry,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at",[`fossgis:foot:${from.id}:${to.id}`,from.id,to.id,path.provider,path.seconds,path.meters,JSON.stringify(geometry),fetchedAt,expiresAt]);
    return Response.json(path,{headers});
  }catch(error){const code=error instanceof Error?error.message:"routing_unavailable";return Response.json({error:["invalid_place","outside_campus","walking_path_unavailable"].includes(code)?code:"routing_unavailable"},{status:code==="invalid_place"||code==="outside_campus"?400:503,headers});}
  finally{await release();await db.end().catch(()=>{});}
});
