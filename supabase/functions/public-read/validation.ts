const fields: Record<string, string> = {
  transit_sources: "id,name,timezone,attribution,static_url,enabled",
  feed_status: "id,state,last_attempt_at,last_success_at,updated_at,source_timestamp,entity_count,error_code,next_attempt_at",
  transit_buildings: "id,name,aliases,latitude,longitude,provenance,verified_at",
  transit_entrances: "id,building_id,name,latitude,longitude,accessible,provenance",
  transit_routes: "id,source_id,source_id_raw,short_name,long_name,color,text_color,active",
  transit_stops: "id,source_id,source_id_raw,name,latitude,longitude,location_type,parent_station,active",
  transit_shapes: "id,source_id,source_id_raw,points",
  transit_services: "id,source_id,source_id_raw,calendar,exceptions",
  transit_trips: "id,source_id,source_id_raw,route_id,service_id,shape_id,direction_id,headsign,active",
  transit_stop_times: "id,trip_id,stop_id,stop_sequence,arrival_seconds,departure_seconds,pickup_type,drop_off_type",
  transit_frequencies: "id,trip_id,start_seconds,end_seconds,headway_seconds,exact_times",
  transit_vehicles: "id,source_id,source_id_raw,route_id,trip_id,instance_key,stop_id,stop_sequence,latitude,longitude,bearing,speed,source_timestamp,received_at,position_timestamp,position_timestamp_kind,current_status",
  transit_arrivals: "id,source_id,trip_id,instance_key,route_id,stop_id,stop_sequence,arrival_at,departure_at,uncertainty_seconds,relationship,source_timestamp,received_at,update_timestamp,timestamp_kind,provenance,valid_until",
  transit_alerts: "id,source_id,source_id_raw,header,description,url,cause,effect,active_periods,informed_entities,source_timestamp,received_at,active,provenance",
  transit_alert_entities: "id,alert_id,route_id,stop_id,trip_id,selector",
  transit_walking_cache: "id,origin_id,destination_id,provider,profile,duration_seconds,distance_meters,geometry,fetched_at,expires_at",
  manual_notices: "id,title,body,route_ids,stop_ids,valid_from,valid_until,source_url,updated_at",
};
export function publicQuery(path: unknown, now = new Date().toISOString()) {
  if (typeof path !== "string" || path.length > 10000 || !/^\/rest\/v1\/[a-z_]+(?:\?|$)/.test(path)) return null;
  const url = new URL(path, "https://public.invalid"), table = url.pathname.slice("/rest/v1/".length), allowed = fields[table]?.split(",");
  if (!allowed || [...url.searchParams].length > 20) return null;
  const params = new URLSearchParams(url.search);
  for (const [name, value] of params) {
    if (name === "select") {
      if (value !== "*" && (!value || value.split(",").some(column => !allowed.includes(column.trim())))) return null;
    } else if (name === "limit" || name === "offset") {
      if (!/^\d{1,5}$/.test(value) || Number(value) > (name === "limit" ? 1000 : 10000)) return null;
    } else if (name === "order") {
      if (value.split(",").length > 3 || value.split(",").some(part => { const [column, ...modifiers] = part.split("."); return !allowed.includes(column) || modifiers.some(m => !["asc", "desc", "nullsfirst", "nullslast"].includes(m)); })) return null;
    } else {
      if (!allowed.includes(name) || value.length > 7000) return null;
      if (/^in\.\([^()]{1,6500}\)$/.test(value)) { if (value.split(",").length > 200) return null; }
      else if (!/^(eq|neq|gt|gte|lt|lte|is|like|ilike)\.[\s\S]{1,400}$/.test(value)) return null;
    }
  }
  params.set("select", !params.has("select") || params.get("select") === "*" ? fields[table] : params.get("select")!);
  if (!params.has("limit")) params.set("limit", "1000");
  if (table === "manual_notices") { params.append("valid_from", `lte.${now}`); params.append("valid_until", `gt.${now}`); }
  if (table === "transit_walking_cache") { params.append("profile", "eq.foot"); params.append("expires_at", `gt.${now}`); }
  return { table, path: `/rest/v1/${table}?${params}`, ttl: ["transit_vehicles", "feed_status", "transit_arrivals"].includes(table) ? 5000 : table === "transit_alerts" || table === "manual_notices" ? 30000 : 300000 };
}
