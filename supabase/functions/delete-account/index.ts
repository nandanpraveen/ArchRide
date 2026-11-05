import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { cors, guard } from "../_shared/http.ts";
import { tokenSessionId } from "../_shared/identity.ts";
Deno.serve(async (request: Request) => {
  const early = guard(request); if (early) return early;
  const headers = cors(request), token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  let db: pg.Client | null = null;
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.getUser(token);
    const session = tokenSessionId(token);
    if (error || !data.user || data.user.is_anonymous || !session) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const raw = await request.text(); if (raw.length > 4096) return Response.json({ error: "request_too_large" }, { status: 413, headers });
    let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid_request" }, { status: 400, headers }); }
    if (body?.confirmation !== "DELETE") return Response.json({ error: "confirmation_required" }, { status: 400, headers });
    db = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL"), connectionTimeoutMillis: 5000, statement_timeout: 5000, application_name: "archride-account-deletion" });
    await db.connect();
    const live = await db.query("select exists(select 1 from auth.sessions where id=$1 and user_id=$2) as valid", [session, data.user.id]);
    if (!live.rows[0]?.valid) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const revoked = await admin.auth.admin.signOut(token, "global");
    if (revoked.error) throw new Error("revoke_failed");
    const removed = await admin.auth.admin.deleteUser(data.user.id);
    if (removed.error) throw new Error("delete_failed");
    return Response.json({ deleted: true }, { headers });
  } catch { return Response.json({ error: "deletion_failed" }, { status: 503, headers }); }
  finally { if (db) await db.end().catch(() => {}); }
});
