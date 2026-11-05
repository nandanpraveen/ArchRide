import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { cors, guard } from "../_shared/http.ts";
import { tokenSessionId } from "../_shared/identity.ts";
import { trustedAdmin, validCorrection, validNotice } from "./validation.ts";
const uuid = (id: unknown) => typeof id === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
Deno.serve(async (request: Request) => {
  const early = guard(request); if (early) return early;
  const headers = cors(request), token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!token) return reply({ error: "unauthorized" }, 401);
  let db: pg.Client | null = null;
  try {
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return reply({ error: "unauthorized" }, 401);
    if (!trustedAdmin(data.user)) return reply({ error: "admin_required" }, 403);
    const session = tokenSessionId(token);
    if (!session) return reply({ error: "unauthorized" }, 401);
    const raw = await request.text(); if (raw.length > 4096) return reply({ error: "request_too_large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply({ error: "invalid_request" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "invalid_request" }, 400);
    db = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL"), connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: "archride-admin" });
    await db.connect();
    const live = await db.query("select exists(select 1 from auth.sessions where id=$1 and user_id=$2) as valid", [session, data.user.id]);
    if (!live.rows[0]?.valid) return reply({ error: "unauthorized" }, 401);
    if (body.action === "status") {
      const feeds = await db.query("select id,state,last_attempt_at,last_success_at,source_timestamp,entity_count,error_code,next_attempt_at from public.feed_status order by id");
      const jobs = await db.query("select feed_id,started_at,finished_at,outcome,entity_count,error_code from public.transit_job_runs order by started_at desc limit 20");
      const retention = await db.query("select * from public.transit_retention");
      const storage = await db.query("select pg_database_size(current_database()) as bytes");
      const evaluation = await db.query("select created_at,evaluation,promoted from archride_private.prediction_models order by created_at desc limit 1");
      const notices = await db.query("select id,title,body,route_ids,stop_ids,valid_from,valid_until,source_url,updated_at from public.manual_notices order by updated_at desc limit 50");
      const corrections = await db.query("select kind,place_id,name,latitude,longitude,source_url,updated_at from archride_private.place_corrections order by updated_at desc limit 100");
      const audit = await db.query("select action,target_id,created_at from archride_private.admin_audit order by created_at desc limit 20");
      return reply({ feeds: feeds.rows, jobs: jobs.rows, retention: retention.rows[0], databaseBytes: Number(storage.rows[0].bytes), evaluation: evaluation.rows[0] ?? null, notices: notices.rows, corrections: corrections.rows, audit: audit.rows });
    }
    if (!["retry", "cleanup", "notice_save", "notice_expire", "correction_save", "correction_remove"].includes(String(body.action))) return reply({ error: "invalid_action" }, 400);
    if (body.action === "notice_save" && (!validNotice(body) || (body.id && !uuid(body.id)))) return reply({ error: "invalid_notice" }, 400);
    if (body.action === "notice_expire" && !uuid(body.id)) return reply({ error: "invalid_notice" }, 400);
    if (body.action === "correction_save" && !validCorrection(body)) return reply({ error: "invalid_correction" }, 400);
    if (body.action === "correction_remove" && (!["building", "entrance"].includes(String(body.kind)) || typeof body.placeId !== "string")) return reply({ error: "invalid_correction" }, 400);
    await db.query("begin");
    const lock = await db.query("select pg_try_advisory_xact_lock(hashtext('archride-admin-operations')) as acquired");
    if (!lock.rows[0]?.acquired) { await db.query("rollback"); return reply({ error: "operation_in_progress" }, 409); }
    let target = "system", details: unknown = {}, result: unknown = { saved: true };
    if (body.action === "retry" || body.action === "cleanup") {
      const recent = await db.query("select 1 from archride_private.admin_audit where action=$1 and created_at>now()-interval '1 minute' limit 1", [body.action]);
      if (recent.rowCount) { await db.query("rollback"); return reply({ error: "retry_later" }, 429); }
      if (body.action === "retry") {
        const dispatched = await db.query("select archride_private.dispatch_transit('all') as request_id");
        result = { queued: !!dispatched.rows[0]?.request_id }; details = result;
      } else {
        await db.query("select archride_private.cleanup_transit(); select archride_private.cleanup_rider_data(); select archride_private.confirm_rider_reports()");
        result = { cleaned: true };
      }
    } else if (body.action === "notice_save") {
      for (const [ids, table] of [[body.routeIds, "transit_routes"], [body.stopIds, "transit_stops"]] as const) {
        const known = await db.query(`select id from public.${table} where id=any($1::text[])`, [ids]);
        if (known.rowCount !== new Set(ids as string[]).size) { await db.query("rollback"); return reply({ error: "unknown_route_or_stop" }, 400); }
      }
      const saved = await db.query("insert into public.manual_notices(id,title,body,route_ids,stop_ids,valid_from,valid_until,source_url,created_by) values(coalesce($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set title=excluded.title,body=excluded.body,route_ids=excluded.route_ids,stop_ids=excluded.stop_ids,valid_from=excluded.valid_from,valid_until=excluded.valid_until,source_url=excluded.source_url,updated_at=now() returning id", [body.id || null, body.title, body.body, body.routeIds, body.stopIds, body.validFrom, body.validUntil, body.sourceUrl, data.user.id]);
      target = saved.rows[0].id; details = { title: body.title, validFrom: body.validFrom, validUntil: body.validUntil };
    } else if (body.action === "notice_expire") {
      const expired = await db.query("update public.manual_notices set valid_from=least(valid_from,now()-interval '1 millisecond'),valid_until=now(),updated_at=now() where id=$1 returning id", [body.id]);
      if (!expired.rowCount) { await db.query("rollback"); return reply({ error: "notice_not_active" }, 400); }
      target = String(body.id);
    } else {
      const table = body.kind === "building" ? "transit_buildings" : "transit_entrances";
      const place = await db.query(`select id,name,latitude,longitude,provenance from public.${table} where id=$1 for update`, [body.placeId]);
      if (!place.rows[0]) { await db.query("rollback"); return reply({ error: "unknown_place" }, 400); }
      target = `${body.kind}:${body.placeId}`;
      if (body.action === "correction_save") {
        await db.query("insert into archride_private.place_corrections(kind,place_id,name,latitude,longitude,source_url,source_values,updated_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8) on conflict(kind,place_id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,source_url=excluded.source_url,updated_by=excluded.updated_by,updated_at=now()", [body.kind, body.placeId, body.name, body.latitude, body.longitude, body.sourceUrl, JSON.stringify(place.rows[0]), data.user.id]);
        await db.query("select set_config('archride.applying_correction','true',true)");
        await db.query(`update public.${table} set name=$2,latitude=$3,longitude=$4 where id=$1`, [body.placeId, body.name, body.latitude, body.longitude]);
        details = { before: place.rows[0], after: { name: body.name, latitude: body.latitude, longitude: body.longitude, sourceUrl: body.sourceUrl } };
      } else {
        const removed = await db.query("delete from archride_private.place_corrections where kind=$1 and place_id=$2 returning source_values", [body.kind, body.placeId]);
        if (!removed.rows[0]) { await db.query("rollback"); return reply({ error: "correction_not_found" }, 400); }
        const original = removed.rows[0].source_values;
        await db.query(`update public.${table} set name=$2,latitude=$3,longitude=$4,provenance=$5 where id=$1`, [body.placeId, original.name, original.latitude, original.longitude, original.provenance]);
      }
    }
    await db.query("insert into archride_private.admin_audit(actor_id,action,target_id,details) values($1,$2,$3,$4::jsonb)", [data.user.id, body.action, target, JSON.stringify(details)]);
    await db.query("commit");
    return reply(result);
  } catch {
    if (db) await db.query("rollback").catch(() => {});
    return reply({ error: "operations_unavailable" }, 503);
  } finally { if (db) await db.end().catch(() => {}); }
});
